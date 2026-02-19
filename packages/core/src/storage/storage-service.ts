import {
    IStorageProvider, Group, User, GroupData, UserSettings, CachedGroup,
    MemberInput, Expense, Settlement, Member, SchemaType,
    QUOZEN_PREFIX, REQUIRED_SHEETS, SCHEMAS
} from "../types";
import { IStorageAdapter } from "./adapter";
import { ConflictError, NotFoundError } from "../errors";

const QUOZEN_METADATA = {
    quozen_type: 'group',
    version: '1.0'
};

export class StorageService implements IStorageProvider {
    private _mutex: Promise<void> = Promise.resolve();

    constructor(private adapter: IStorageAdapter) {
        console.log("[StorageService] Initialized with adapter");
    }

    private async _runExclusive<T>(task: () => Promise<T>): Promise<T> {
        const previousTask = this._mutex;
        let release: () => void;
        const currentTaskSignal = new Promise<void>(resolve => { release = resolve; });
        this._mutex = previousTask.then(() => currentTaskSignal).catch(() => currentTaskSignal);

        try {
            await previousTask;
        } catch (e) {
            // Proceed even if previous task failed
        }

        try {
            return await task();
        } finally {
            release!();
        }
    }

    // --- Settings Management ---

    async getSettings(userEmail: string): Promise<UserSettings> {
        return this._runExclusive(async () => {
            let settings = await this.adapter.loadSettings(userEmail);
            if (!settings) {
                settings = await this._reconcileGroupsImpl(userEmail);
            }
            return settings;
        });
    }

    async saveSettings(userEmail: string, settings: UserSettings): Promise<void> {
        return this._runExclusive(() => this.adapter.saveSettings(userEmail, settings));
    }

    async updateActiveGroup(userEmail: string, groupId: string): Promise<void> {
        return this._runExclusive(async () => {
            const settings = await this._getSettingsInternal(userEmail);
            if (settings.activeGroupId === groupId) return;

            settings.activeGroupId = groupId;
            const cached = settings.groupCache.find(g => g.id === groupId);
            if (cached) {
                cached.lastAccessed = new Date().toISOString();
            }
            await this.adapter.saveSettings(userEmail, settings);
        });
    }

    private async _getSettingsInternal(userEmail: string): Promise<UserSettings> {
        let settings = await this.adapter.loadSettings(userEmail);
        if (!settings) {
            settings = await this._reconcileGroupsImpl(userEmail);
        }
        return settings;
    }

    async reconcileGroups(userEmail: string): Promise<UserSettings> {
        return this._runExclusive(() => this._reconcileGroupsImpl(userEmail));
    }

    private async _reconcileGroupsImpl(userEmail: string): Promise<UserSettings> {
        // US-202: Strict Reconciliation using Metadata
        // Only return files that have 'quozen_type' = 'group' property
        const files = await this.adapter.listFiles({ properties: { quozen_type: 'group' } });

        const visibleGroups: CachedGroup[] = files
            .map(file => ({
                id: file.id,
                name: file.name.startsWith(QUOZEN_PREFIX) ? file.name.slice(QUOZEN_PREFIX.length) : file.name,
                role: (file.owners?.some((o: any) => o.emailAddress === userEmail) || file.capabilities?.canDelete) ? "owner" as const : "member" as const,
                lastAccessed: file.createdTime
            }))
            .sort((a, b) => new Date(b.lastAccessed || 0).getTime() - new Date(a.lastAccessed || 0).getTime());

        const settings: UserSettings = {
            version: 1,
            activeGroupId: visibleGroups[0]?.id || null,
            groupCache: visibleGroups,
            preferences: { defaultCurrency: "USD", theme: "system" },
            lastUpdated: new Date().toISOString()
        };

        await this.adapter.saveSettings(userEmail, settings);
        return settings;
    }

    // --- Group Operations ---

    async createGroupSheet(name: string, user: User, members: MemberInput[] = []): Promise<Group> {
        return this._runExclusive(async () => {
            const title = `${QUOZEN_PREFIX}${name}`;

            // US-201: Stamp metadata on creation
            const fileId = await this.adapter.createFile(title, [...REQUIRED_SHEETS], QUOZEN_METADATA);

            const initialMembers: Member[] = [];
            initialMembers.push({
                userId: user.id || "unknown",
                email: user.email,
                name: user.name,
                role: "owner",
                joinedAt: new Date().toISOString(),
                _rowIndex: 2
            });

            for (const member of members) {
                let memberName = member.username || member.email || "Unknown";
                let memberId = member.email || member.username || `user-${crypto.randomUUID()}`;
                if (member.email) {
                    const displayName = await this.adapter.shareFile(fileId, member.email, "writer");
                    if (displayName) memberName = displayName;
                    memberId = member.email;
                }
                initialMembers.push({
                    userId: memberId,
                    email: member.email || "",
                    name: memberName,
                    role: "member",
                    joinedAt: new Date().toISOString(),
                    _rowIndex: initialMembers.length + 2
                });
            }

            const initialData: GroupData = {
                expenses: [],
                settlements: [],
                members: initialMembers
            };

            await this.adapter.initializeGroup(fileId, initialData);

            if (user.email) {
                try {
                    const settings = await this._getSettingsInternal(user.email);
                    if (!settings.groupCache.some(g => g.id === fileId)) {
                        settings.groupCache.unshift({
                            id: fileId,
                            name: name,
                            role: "owner",
                            lastAccessed: new Date().toISOString()
                        });
                    }
                    settings.activeGroupId = fileId;
                    await this.adapter.saveSettings(user.email, settings);
                } catch (e) {
                    console.error("Settings update failed during create", e);
                }
            }

            return {
                id: fileId,
                name,
                description: "Google Sheet Group",
                createdBy: "me",
                participants: initialMembers.map(m => m.userId),
                createdAt: new Date().toISOString(),
                isOwner: true
            };
        });
    }

    async setGroupPermissions(groupId: string, access: 'public' | 'restricted'): Promise<void> {
        await this.adapter.setFilePermissions(groupId, access);
    }

    async getGroupPermissions(groupId: string): Promise<'public' | 'restricted'> {
        return await this.adapter.getFilePermissions(groupId);
    }

    async joinGroup(spreadsheetId: string, user: User): Promise<Group> {
        // US-204: Join Metadata Guard
        const meta = await this.adapter.getFileMeta(spreadsheetId);

        // Ensure it's a valid Quozen group via properties
        if (meta.properties?.quozen_type !== 'group') {
            throw new Error("This file is not a valid Quozen Group.");
        }

        return this._runExclusive(async () => {
            // 2. Read Member Data to check if we are already in
            const data = await this.adapter.readGroupData(spreadsheetId);
            if (!data) throw new Error("Could not read group data");

            const existingMember = data.members.find(m => m.userId === user.id || m.email === user.email);

            if (!existingMember) {
                // 3. Add to Members sheet
                await this.adapter.appendRow(spreadsheetId, "Members", {
                    userId: user.id,
                    email: user.email,
                    name: user.name,
                    role: "member",
                    joinedAt: new Date().toISOString()
                });
            }

            // 4. Run standard Import/Sync logic (INTERNAL CALL to avoid Deadlock)
            return await this._importGroupImpl(spreadsheetId, user);
        });
    }

    async importGroup(spreadsheetId: string, user: User): Promise<Group> {
        return this._runExclusive(async () => {
            // US-203: "Blessing" flow inside import
            const meta = await this.adapter.getFileMeta(spreadsheetId);
            if (meta.properties?.quozen_type !== 'group') {
                // If not stamped, validate deeply and stamp if valid
                const validation = await this.validateQuozenSpreadsheet(spreadsheetId, user.email);
                if (!validation.valid) throw new Error("Invalid Quozen Group. Missing required sheets.");

                // Stamp it
                await this.adapter.addFileProperties(spreadsheetId, QUOZEN_METADATA);
            }

            return await this._importGroupImpl(spreadsheetId, user);
        });
    }

    /**
     * Internal implementation of importGroup that assumes the caller holds the mutex.
     */
    private async _importGroupImpl(spreadsheetId: string, user: User): Promise<Group> {
        const validation = await this.validateQuozenSpreadsheet(spreadsheetId, user.email);
        if (!validation.valid) throw new Error(validation.error || "Invalid group file");

        // Fix: Determine role from group data
        let role: "owner" | "member" = "member";
        if (validation.data) {
            const member = validation.data.members.find(m => m.email === user.email || m.userId === user.id);
            if (member?.role === "owner") role = "owner";
        }

        try {
            const currentGoogleId = user.id;
            const currentDisplayName = user.name;

            if (currentGoogleId && validation.data) {
                const memberToUpdate = validation.data.members.find(m => m.email === user.email);
                if (memberToUpdate) {
                    const needsNameUpdate = currentDisplayName && memberToUpdate.name !== currentDisplayName;
                    const needsIdMigration = memberToUpdate.userId !== currentGoogleId;

                    if (needsNameUpdate || needsIdMigration) {
                        const updatedMember = {
                            ...memberToUpdate,
                            userId: needsIdMigration ? currentGoogleId : memberToUpdate.userId,
                            name: needsNameUpdate ? currentDisplayName : memberToUpdate.name
                        };
                        if (memberToUpdate._rowIndex) {
                            await this.adapter.updateRow(spreadsheetId, "Members", memberToUpdate._rowIndex, updatedMember);
                        }
                    }

                    if (needsIdMigration) {
                        await this._migrateMemberExpensesAndSettlements(spreadsheetId, memberToUpdate.userId, currentGoogleId, validation.data);
                    }
                }
            }
        } catch (e) {
            console.error("Migration check failed", e);
        }

        const settings = await this._getSettingsInternal(user.email);
        const groupName = validation.name || "Imported Group";
        const cleanName = groupName.startsWith(QUOZEN_PREFIX) ? groupName.slice(QUOZEN_PREFIX.length) : groupName;

        const cachedGroup = settings.groupCache.find(g => g.id === spreadsheetId);

        if (!cachedGroup) {
            settings.groupCache.unshift({
                id: spreadsheetId,
                name: cleanName,
                role: role,
                lastAccessed: new Date().toISOString()
            });
        } else {
            cachedGroup.role = role;
            cachedGroup.lastAccessed = new Date().toISOString();
        }

        settings.activeGroupId = spreadsheetId;
        await this.adapter.saveSettings(user.email, settings);

        return {
            id: spreadsheetId,
            name: cleanName,
            description: "Imported",
            createdBy: "Unknown",
            participants: [],
            createdAt: new Date().toISOString(),
            isOwner: role === "owner"
        };
    }

    private async _migrateMemberExpensesAndSettlements(spreadsheetId: string, oldId: string, newId: string, groupData: GroupData): Promise<void> {
        const expensesToUpdate = groupData.expenses.filter(e =>
            e.paidBy === oldId || (e.splits && e.splits.some((s: any) => s.userId === oldId))
        );

        for (const exp of expensesToUpdate) {
            if (!exp._rowIndex) continue;
            const updates: Partial<Expense> = {};
            if (exp.paidBy === oldId) updates.paidBy = newId;

            if (exp.splits && exp.splits.some((s: any) => s.userId === oldId)) {
                updates.splits = exp.splits.map((s: any) =>
                    s.userId === oldId ? { ...s, userId: newId } : s
                );
            }
            await this.adapter.updateRow(spreadsheetId, "Expenses", exp._rowIndex, { ...exp, ...updates });
        }

        const settlementsToUpdate = groupData.settlements.filter(s =>
            s.fromUserId === oldId || s.toUserId === oldId
        );

        for (const set of settlementsToUpdate) {
            if (!set._rowIndex) continue;
            const updates: Partial<Settlement> = {};
            if (set.fromUserId === oldId) updates.fromUserId = newId;
            if (set.toUserId === oldId) updates.toUserId = newId;
            await this.adapter.updateRow(spreadsheetId, "Settlements", set._rowIndex, { ...set, ...updates });
        }
    }

    async updateGroup(groupId: string, name: string, members: MemberInput[], userEmail: string): Promise<void> {
        const newTitle = `${QUOZEN_PREFIX}${name}`;
        await this.adapter.renameFile(groupId, newTitle);

        const groupData = await this.adapter.readGroupData(groupId);
        if (groupData) {
            const currentMembers = groupData.members;
            const processedIds = new Set<string>();
            const desiredMembers = members.map(m => ({ id: m.email || m.username || "", ...m })).filter(m => m.id);

            for (const desired of desiredMembers) {
                const existing = currentMembers.find(c => (desired.email && c.email === desired.email) || (desired.username && c.userId === desired.username));
                if (existing) {
                    processedIds.add(existing.userId);
                } else {
                    let memberName = desired.username || desired.email || "Unknown";
                    let memberId = desired.username || desired.email || `user-${crypto.randomUUID()}`;
                    if (desired.email) {
                        const displayName = await this.adapter.shareFile(groupId, desired.email, "writer");
                        if (displayName) memberName = displayName;
                        memberId = desired.email;
                    }

                    await this.adapter.appendRow(groupId, "Members", {
                        userId: memberId,
                        email: desired.email || "",
                        name: memberName,
                        role: "member",
                        joinedAt: new Date().toISOString()
                    });
                    processedIds.add(memberId);
                }
            }

            const membersToDelete = currentMembers.filter(m => !processedIds.has(m.userId) && m.role !== 'owner');
            membersToDelete.sort((a, b) => (b._rowIndex || 0) - (a._rowIndex || 0));

            for (const m of membersToDelete) {
                if (m._rowIndex) await this.adapter.deleteRow(groupId, "Members", m._rowIndex);
            }
        }

        await this._runExclusive(async () => {
            const settings = await this._getSettingsInternal(userEmail);
            const cachedGroup = settings.groupCache.find(g => g.id === groupId);
            if (cachedGroup && cachedGroup.name !== name) {
                cachedGroup.name = name;
                await this.adapter.saveSettings(userEmail, settings);
            }
        });
    }

    async deleteGroup(groupId: string, userEmail: string): Promise<void> {
        await this.adapter.deleteFile(groupId);

        await this._runExclusive(async () => {
            const settings = await this._getSettingsInternal(userEmail);
            const initialLength = settings.groupCache.length;
            settings.groupCache = settings.groupCache.filter(g => g.id !== groupId);

            if (settings.groupCache.length !== initialLength) {
                if (settings.activeGroupId === groupId) {
                    settings.activeGroupId = settings.groupCache[0]?.id || null;
                }
                await this.adapter.saveSettings(userEmail, settings);
            }
        });
    }

    async leaveGroup(groupId: string, userId: string, userEmail: string): Promise<void> {
        const data = await this.adapter.readGroupData(groupId);
        if (!data) throw new Error("Group not found");

        const member = data.members.find(m => m.userId === userId || (userEmail && m.email === userEmail));
        if (!member) throw new Error("Member not found");
        if (member.role === 'owner') throw new Error("Owners cannot leave.");

        const hasExpenses = await this.checkMemberHasExpenses(groupId, member.userId);
        if (hasExpenses) throw new Error("Cannot leave with expenses.");

        if (member._rowIndex) await this.adapter.deleteRow(groupId, "Members", member._rowIndex);

        await this._runExclusive(async () => {
            const settings = await this._getSettingsInternal(userEmail);
            const initialLength = settings.groupCache.length;
            settings.groupCache = settings.groupCache.filter(g => g.id !== groupId);

            if (settings.groupCache.length !== initialLength) {
                if (settings.activeGroupId === groupId) {
                    settings.activeGroupId = settings.groupCache[0]?.id || null;
                }
                await this.adapter.saveSettings(userEmail, settings);
            }
        });
    }

    async checkMemberHasExpenses(groupId: string, userId: string): Promise<boolean> {
        const data = await this.adapter.readGroupData(groupId);
        if (!data) return false;
        return data.expenses.some(e => e.paidBy === userId || (e.splits && e.splits.some((s: any) => s.userId === userId && s.amount > 0)));
    }

    async validateQuozenSpreadsheet(spreadsheetId: string, userEmail: string): Promise<{ valid: boolean; error?: string; name?: string; data?: GroupData }> {
        try {
            const meta = await this.adapter.getFileMeta(spreadsheetId);
            // Basic title check as fallback if properties missing (for legacy files)
            // US-203 logic handles stricter metadata checks in importGroup

            if (!REQUIRED_SHEETS.every(t => meta.sheetNames.includes(t))) return { valid: false, error: "Missing tabs" };

            const data = await this.adapter.readGroupData(spreadsheetId);
            if (!data) return { valid: false, error: "Could not read data" };

            const isMember = data.members.some(m => m.email === userEmail);
            // We allow non-members to validate so they can join/import, but typically joinGroup handles the member check logic

            return { valid: true, name: meta.title, data };
        } catch (e: any) {
            return { valid: false, error: e.message };
        }
    }

    async getGroupData(spreadsheetId: string): Promise<GroupData | null> {
        return this.adapter.readGroupData(spreadsheetId);
    }

    async addExpense(spreadsheetId: string, expenseData: Partial<Expense>): Promise<void> {
        const expense = {
            id: crypto.randomUUID(),
            ...expenseData,
            splits: expenseData.splits || [],
            meta: { createdAt: new Date().toISOString(), lastModified: new Date().toISOString() }
        };
        await this.adapter.appendRow(spreadsheetId, "Expenses", expense);
    }

    async updateExpense(spreadsheetId: string, rowIndex: number, expenseData: Partial<Expense>, expectedLastModified?: string): Promise<void> {
        return this._runExclusive(async () => {
            const currentRow = await this.adapter.readRow(spreadsheetId, "Expenses", rowIndex);
            if (!currentRow) throw new NotFoundError();

            const currentId = currentRow.id;
            if (currentId !== expenseData.id) throw new ConflictError("ID Mismatch");

            if (expectedLastModified && currentRow.meta?.lastModified) {
                if (new Date(currentRow.meta.lastModified).getTime() > new Date(expectedLastModified).getTime()) {
                    throw new ConflictError();
                }
            }

            const updates = {
                ...expenseData,
                splits: expenseData.splits || [],
                meta: { ...currentRow.meta, lastModified: new Date().toISOString() }
            };

            await this.adapter.updateRow(spreadsheetId, "Expenses", rowIndex, updates);
        });
    }

    async deleteExpense(spreadsheetId: string, rowIndex: number, expenseId: string): Promise<void> {
        return this._runExclusive(async () => {
            const currentRow = await this.adapter.readRow(spreadsheetId, "Expenses", rowIndex);
            if (!currentRow || currentRow.id !== expenseId) throw new ConflictError();
            await this.adapter.deleteRow(spreadsheetId, "Expenses", rowIndex);
        });
    }

    async addSettlement(spreadsheetId: string, settlementData: Partial<Settlement>): Promise<void> {
        const settlement = {
            id: crypto.randomUUID(),
            ...settlementData,
            date: settlementData.date || new Date().toISOString()
        };
        await this.adapter.appendRow(spreadsheetId, "Settlements", settlement);
    }

    async updateSettlement(spreadsheetId: string, rowIndex: number, settlementData: Partial<Settlement>): Promise<void> {
        return this._runExclusive(async () => {
            const currentRow = await this.adapter.readRow(spreadsheetId, "Settlements", rowIndex);
            if (!currentRow) throw new NotFoundError();

            if (currentRow.id !== settlementData.id) throw new ConflictError("ID Mismatch or row shifted");

            const updates = { ...currentRow, ...settlementData };
            await this.adapter.updateRow(spreadsheetId, "Settlements", rowIndex, updates);
        });
    }

    async deleteSettlement(spreadsheetId: string, rowIndex: number, settlementId: string): Promise<void> {
        return this._runExclusive(async () => {
            const currentRow = await this.adapter.readRow(spreadsheetId, "Settlements", rowIndex);
            if (!currentRow || currentRow.id !== settlementId) throw new ConflictError("ID Mismatch or row shifted");
            await this.adapter.deleteRow(spreadsheetId, "Settlements", rowIndex);
        });
    }

    async updateRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void> {
        await this.adapter.updateRow(spreadsheetId, sheetName, rowIndex, data);
    }

    async deleteRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number): Promise<void> {
        await this.adapter.deleteRow(spreadsheetId, sheetName, rowIndex);
    }

    async getLastModified(fileId: string): Promise<string> {
        return this.adapter.getLastModified(fileId);
    }
}
