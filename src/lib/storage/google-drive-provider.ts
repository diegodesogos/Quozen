import { IStorageProvider, Group, User, GroupData, SCHEMAS, SchemaType, MemberInput, Member, Expense, UserSettings, CachedGroup, Settlement } from "./types";
import { getAuthToken } from "../tokenStore";
import { ConflictError, NotFoundError } from "../errors";

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3";
const SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets";

export const QUOZEN_PREFIX = "Quozen - ";
export const SETTINGS_FILE_NAME = "quozen-settings.json";
export const REQUIRED_SHEETS = ["Expenses", "Settlements", "Members"] as const;

export class GoogleDriveProvider implements IStorageProvider {
    private settingsFileIdCache: string | null = null;
    private _mutex: Promise<void> = Promise.resolve();
    private sheetIdCache = new Map<string, number>();

    constructor() {
        console.log("[Drive] GoogleDriveProvider initialized.");
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

    private async fetchWithAuth(url: string, options: RequestInit = {}) {
        const token = getAuthToken();
        if (!token) throw new Error("No access token found. Please sign in.");

        const headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers,
        };

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error("Session expired (401). Please reload to sign in again.");
            }
            const errorBody = await response.text();
            throw new Error(`Google API Error ${response.status}: ${errorBody}`);
        }

        return response;
    }

    private async shareFile(fileId: string, email: string): Promise<string> {
        try {
            const res = await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}/permissions`, {
                method: "POST",
                body: JSON.stringify({
                    role: "writer",
                    type: "user",
                    emailAddress: email
                })
            });
            const data = await res.json();
            return data.displayName || email;
        } catch (e) {
            console.error(`Failed to share with ${email}`, e);
            return email;
        }
    }

    // --- ID Migration Logic ---

    // Updated: Only updates Expenses and Settlements. Member row update handled separately to avoid overwrite race conditions.
    private async _migrateMemberExpensesAndSettlements(spreadsheetId: string, oldId: string, newId: string, groupData: GroupData): Promise<void> {
        console.log(`[Migration] Migrating data from ${oldId} to ${newId} in group ${spreadsheetId}`);

        // 1. Update Expenses Sheet (PaidBy and Splits)
        const expensesToUpdate = groupData.expenses.filter(e =>
            e.paidBy === oldId || e.splits.some((s: any) => s.userId === oldId)
        );

        for (const exp of expensesToUpdate) {
            if (!exp._rowIndex) continue;

            const updates: Partial<Expense> = {};
            if (exp.paidBy === oldId) updates.paidBy = newId;

            if (exp.splits.some((s: any) => s.userId === oldId)) {
                updates.splits = exp.splits.map((s: any) =>
                    s.userId === oldId ? { ...s, userId: newId } : s
                );
            }

            // Direct update without conflict check for migration
            await this.updateRow(spreadsheetId, "Expenses", exp._rowIndex, { ...exp, ...updates });
        }

        // 2. Update Settlements Sheet
        const settlementsToUpdate = groupData.settlements.filter(s =>
            s.fromUserId === oldId || s.toUserId === oldId
        );

        for (const set of settlementsToUpdate) {
            if (!set._rowIndex) continue;
            const updates: Partial<Settlement> = {};
            if (set.fromUserId === oldId) updates.fromUserId = newId;
            if (set.toUserId === oldId) updates.toUserId = newId;

            await this.updateRow(spreadsheetId, "Settlements", set._rowIndex, { ...set, ...updates });
        }
    }

    // --- Internal Settings Implementation ---

    private async _getSettingsImpl(userEmail: string): Promise<UserSettings> {
        try {
            const query = `name = '${SETTINGS_FILE_NAME}' and trashed = false`;
            const fields = "files(id, name, createdTime)";
            const listRes = await this.fetchWithAuth(`${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`);
            const listData = await listRes.json();

            if (listData.files && listData.files.length > 0) {
                let fileToUse = listData.files[0];
                if (listData.files.length > 1) {
                    const sortedFiles = listData.files.sort((a: any, b: any) => {
                        const timeA = new Date(a.createdTime || 0).getTime();
                        const timeB = new Date(b.createdTime || 0).getTime();
                        return (timeA - timeB) || (a.id || "").localeCompare(b.id || "");
                    });
                    fileToUse = sortedFiles[0];
                    for (const dup of sortedFiles.slice(1)) {
                        this.fetchWithAuth(`${DRIVE_API_URL}/files/${dup.id}`, { method: "DELETE" }).catch(() => { });
                    }
                }

                this.settingsFileIdCache = fileToUse.id;
                const contentRes = await this.fetchWithAuth(`${DRIVE_API_URL}/files/${fileToUse.id}?alt=media`);
                const settings = await contentRes.json();

                if (!settings.version) return this._reconcileGroupsImpl(userEmail);
                return settings as UserSettings;
            } else {
                return this._reconcileGroupsImpl(userEmail);
            }
        } catch (e: any) {
            const errMsg = String(e?.message || e);
            if (errMsg.includes("401") || errMsg.includes("Session expired")) {
                throw e;
            }
            console.error("Error getting settings, reconciling...", e);
            return this._reconcileGroupsImpl(userEmail);
        }
    }

    private async _saveSettingsImpl(settings: UserSettings): Promise<void> {
        settings.lastUpdated = new Date().toISOString();
        const content = JSON.stringify(settings, null, 2);

        try {
            let fileId = this.settingsFileIdCache;
            if (!fileId) {
                const query = `name = '${SETTINGS_FILE_NAME}' and trashed = false`;
                const listRes = await this.fetchWithAuth(`${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}`);
                const listData = await listRes.json();
                if (listData.files?.[0]) {
                    fileId = listData.files[0].id;
                    this.settingsFileIdCache = fileId;
                }
            }

            if (fileId) {
                await this.fetchWithAuth(`${DRIVE_UPLOAD_URL}/files/${fileId}?uploadType=media`, {
                    method: "PATCH",
                    body: content
                });
            } else {
                const createRes = await this.fetchWithAuth(`${DRIVE_API_URL}/files`, {
                    method: "POST",
                    body: JSON.stringify({ name: SETTINGS_FILE_NAME, mimeType: "application/json" })
                });
                const fileData = await createRes.json();
                this.settingsFileIdCache = fileData.id;
                await this.fetchWithAuth(`${DRIVE_UPLOAD_URL}/files/${fileData.id}?uploadType=media`, {
                    method: "PATCH",
                    body: content
                });
            }
        } catch (e) {
            console.error("Failed to save settings", e);
            throw e;
        }
    }

    private async _reconcileGroupsImpl(userEmail: string): Promise<UserSettings> {
        const query = `mimeType = 'application/vnd.google-apps.spreadsheet' and name contains '${QUOZEN_PREFIX}' and trashed = false`;
        const fields = "files(id, name, createdTime, owners, capabilities)";
        const response = await this.fetchWithAuth(`${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`);
        const data = await response.json();

        const visibleGroups: CachedGroup[] = (data.files || [])
            .filter((file: any) => file.name.startsWith(QUOZEN_PREFIX))
            .map((file: any) => ({
                id: file.id,
                name: file.name.slice(QUOZEN_PREFIX.length),
                role: (file.owners?.some((o: any) => o.emailAddress === userEmail) || file.capabilities?.canDelete) ? "owner" : "member",
                lastAccessed: file.createdTime
            }))
            .sort((a: any, b: any) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime());

        const settings: UserSettings = {
            version: 1,
            activeGroupId: visibleGroups[0]?.id || null,
            groupCache: visibleGroups,
            preferences: { defaultCurrency: "USD", theme: "system" },
            lastUpdated: new Date().toISOString()
        };

        await this._saveSettingsImpl(settings);
        return settings;
    }

    // --- Public Methods (Guarded) ---

    async getSettings(userEmail: string): Promise<UserSettings> {
        return this._runExclusive(() => this._getSettingsImpl(userEmail));
    }

    async saveSettings(settings: UserSettings): Promise<void> {
        return this._runExclusive(() => this._saveSettingsImpl(settings));
    }

    async updateActiveGroup(userEmail: string, groupId: string): Promise<void> {
        return this._runExclusive(async () => {
            const settings = await this._getSettingsImpl(userEmail);
            if (settings.activeGroupId === groupId) return;

            settings.activeGroupId = groupId;
            const cached = settings.groupCache.find(g => g.id === groupId);
            if (cached) {
                cached.lastAccessed = new Date().toISOString();
            }
            await this._saveSettingsImpl(settings);
        });
    }

    async reconcileGroups(userEmail: string): Promise<UserSettings> {
        return this._runExclusive(() => this._reconcileGroupsImpl(userEmail));
    }

    async createGroupSheet(name: string, user: User, members: MemberInput[] = []): Promise<Group> {
        return this._runExclusive(async () => {
            const title = `${QUOZEN_PREFIX}${name}`;
            const createRes = await this.fetchWithAuth(SHEETS_API_URL, {
                method: "POST",
                body: JSON.stringify({
                    properties: { title },
                    sheets: REQUIRED_SHEETS.map(t => ({ properties: { title: t, gridProperties: { frozenRowCount: 1 } } }))
                })
            });
            const sheetFile = await createRes.json();
            const spreadsheetId = sheetFile.spreadsheetId;

            const initialMembersRows = [[user.id, user.email, user.name, "owner", new Date().toISOString()]];
            for (const member of members) {
                let memberName = member.username || member.email || "Unknown";
                let memberId = member.email || member.username || `user-${self.crypto.randomUUID()}`;
                if (member.email) {
                    const displayName = await this.shareFile(spreadsheetId, member.email);
                    if (displayName) memberName = displayName;
                    memberId = member.email;
                }
                initialMembersRows.push([memberId, member.email || "", memberName, "member", new Date().toISOString()]);
            }

            const valuesBody = {
                valueInputOption: "USER_ENTERED",
                data: [
                    { range: "Expenses!A1", values: [SCHEMAS.Expenses] },
                    { range: "Settlements!A1", values: [SCHEMAS.Settlements] },
                    { range: "Members!A1", values: [SCHEMAS.Members] },
                    { range: "Members!A2", values: initialMembersRows }
                ]
            };
            await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}/values:batchUpdate`, {
                method: "POST",
                body: JSON.stringify(valuesBody)
            });

            if (user.email) {
                try {
                    const settings = await this._getSettingsImpl(user.email);
                    if (!settings.groupCache.some(g => g.id === spreadsheetId)) {
                        settings.groupCache.unshift({
                            id: spreadsheetId,
                            name: name,
                            role: "owner",
                            lastAccessed: new Date().toISOString()
                        });
                    }
                    settings.activeGroupId = spreadsheetId;
                    await this._saveSettingsImpl(settings);
                } catch (e) { console.error("Settings update failed during create", e); }
            }

            return {
                id: spreadsheetId,
                name,
                description: "Google Sheet Group",
                createdBy: "me",
                participants: initialMembersRows.map(r => r[0]),
                createdAt: new Date().toISOString(),
                isOwner: true
            };
        });
    }

    async importGroup(spreadsheetId: string, userEmail: string): Promise<Group> {
        const validation = await this.validateQuozenSpreadsheet(spreadsheetId, userEmail);
        if (!validation.valid) throw new Error(validation.error || "Invalid group file");

        return this._runExclusive(async () => {
            try {
                const aboutRes = await this.fetchWithAuth(`${DRIVE_API_URL}/about?fields=user`);
                const aboutData = await aboutRes.json();
                const currentGoogleId = aboutData.user?.permissionId;
                const currentDisplayName = aboutData.user?.displayName;

                if (currentGoogleId && validation.data) {
                    const memberToUpdate = validation.data.members.find(m => m.email === userEmail);

                    if (memberToUpdate) {
                        const needsNameUpdate = currentDisplayName && memberToUpdate.name !== currentDisplayName;
                        const needsIdMigration = memberToUpdate.userId !== currentGoogleId;

                        // Fix Bug-001: Perform single update to Member row to prevent overwrite race conditions
                        if (needsNameUpdate || needsIdMigration) {
                            console.log(`[Import] Updating member record: Name '${memberToUpdate.name}' -> '${currentDisplayName}', ID '${memberToUpdate.userId}' -> '${currentGoogleId}'`);

                            const updatedMember = {
                                ...memberToUpdate,
                                userId: needsIdMigration ? currentGoogleId : memberToUpdate.userId,
                                name: needsNameUpdate ? currentDisplayName : memberToUpdate.name
                            };

                            if (memberToUpdate._rowIndex) {
                                await this.updateRow(spreadsheetId, "Members", memberToUpdate._rowIndex, updatedMember);
                            }
                        }

                        // Migrate Expenses/Settlements if ID changed
                        if (needsIdMigration) {
                            await this._migrateMemberExpensesAndSettlements(spreadsheetId, memberToUpdate.userId, currentGoogleId, validation.data);
                        }
                    }
                }
            } catch (e) {
                console.error("Migration check failed", e);
            }

            const settings = await this._getSettingsImpl(userEmail);
            if (!settings.groupCache.some(g => g.id === spreadsheetId)) {
                settings.groupCache.unshift({
                    id: spreadsheetId,
                    name: validation.name || "Imported Group",
                    role: "member",
                    lastAccessed: new Date().toISOString()
                });
                settings.activeGroupId = spreadsheetId;
                await this._saveSettingsImpl(settings);
            }

            return {
                id: spreadsheetId,
                name: validation.name || "Imported Group",
                description: "Imported",
                createdBy: "Unknown",
                participants: [],
                createdAt: new Date().toISOString(),
                isOwner: false
            };
        });
    }

    async updateGroup(groupId: string, name: string, members: MemberInput[], userEmail: string): Promise<void> {
        const newTitle = `${QUOZEN_PREFIX}${name}`;
        await this.fetchWithAuth(`${DRIVE_API_URL}/files/${groupId}`, {
            method: "PATCH",
            body: JSON.stringify({ name: newTitle })
        });

        const groupData = await this.getGroupData(groupId);
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
                    let memberId = desired.email || desired.username || `user-${self.crypto.randomUUID()}`;
                    if (desired.email) {
                        const displayName = await this.shareFile(groupId, desired.email);
                        if (displayName) memberName = displayName;
                        memberId = desired.email;
                    }
                    await this.addRow(groupId, "Members", { userId: memberId, email: desired.email || "", name: memberName, role: "member", joinedAt: new Date().toISOString() });
                    processedIds.add(memberId);
                }
            }
            const membersToDelete = currentMembers.filter(m => !processedIds.has(m.userId) && m.role !== 'owner');
            membersToDelete.sort((a, b) => (b._rowIndex || 0) - (a._rowIndex || 0));
            for (const m of membersToDelete) {
                if (m._rowIndex) await this.deleteRow(groupId, "Members", m._rowIndex);
            }
        }

        await this._runExclusive(async () => {
            const settings = await this._getSettingsImpl(userEmail);
            const cachedGroup = settings.groupCache.find(g => g.id === groupId);
            if (cachedGroup && cachedGroup.name !== name) {
                cachedGroup.name = name;
                await this._saveSettingsImpl(settings);
            }
        });
    }

    async deleteGroup(groupId: string, userEmail: string): Promise<void> {
        await this.fetchWithAuth(`${DRIVE_API_URL}/files/${groupId}`, { method: "DELETE" });

        await this._runExclusive(async () => {
            const settings = await this._getSettingsImpl(userEmail);
            const initialLength = settings.groupCache.length;
            settings.groupCache = settings.groupCache.filter(g => g.id !== groupId);

            if (settings.groupCache.length !== initialLength) {
                if (settings.activeGroupId === groupId) {
                    settings.activeGroupId = settings.groupCache[0]?.id || null;
                }
                await this._saveSettingsImpl(settings);
            }
        });
    }

    async leaveGroup(groupId: string, userId: string, userEmail: string): Promise<void> {
        const data = await this.getGroupData(groupId);
        if (!data) throw new Error("Group not found");

        const member = data.members.find(m => m.userId === userId || (userEmail && m.email === userEmail));
        if (!member) throw new Error("Member not found");

        if (member.role === 'owner') throw new Error("Owners cannot leave.");

        const hasExpenses = await this.checkMemberHasExpenses(groupId, member.userId);
        if (hasExpenses) throw new Error("Cannot leave with expenses.");

        if (member._rowIndex) await this.deleteRow(groupId, "Members", member._rowIndex);

        await this._runExclusive(async () => {
            const settings = await this._getSettingsImpl(userEmail);
            const initialLength = settings.groupCache.length;
            settings.groupCache = settings.groupCache.filter(g => g.id !== groupId);

            if (settings.groupCache.length !== initialLength) {
                if (settings.activeGroupId === groupId) {
                    settings.activeGroupId = settings.groupCache[0]?.id || null;
                }
                await this._saveSettingsImpl(settings);
            }
        });
    }

    // --- Standard Methods ---

    async checkMemberHasExpenses(groupId: string, userId: string): Promise<boolean> {
        const data = await this.getGroupData(groupId);
        if (!data) return false;
        return data.expenses.some(e => e.paidBy === userId || (e.splits && e.splits.some((s: any) => s.userId === userId && s.amount > 0)));
    }

    async validateQuozenSpreadsheet(spreadsheetId: string, userEmail: string): Promise<{ valid: boolean; error?: string; name?: string; data?: GroupData }> {
        try {
            const metaRes = await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}?fields=properties.title,sheets.properties.title`);
            const meta = await metaRes.json();
            if (!meta.properties?.title?.startsWith(QUOZEN_PREFIX)) return { valid: false, error: "Invalid filename" };

            const titles = meta.sheets?.map((s: any) => s.properties.title) || [];
            if (!REQUIRED_SHEETS.every(t => titles.includes(t))) return { valid: false, error: "Missing tabs" };

            const data = await this.getGroupData(spreadsheetId);
            if (!data) return { valid: false, error: "Could not read data" };

            const isMember = data.members.some(m => m.email === userEmail);
            if (!isMember) return { valid: false, error: "Not a member" };

            return { valid: true, name: meta.properties.title.slice(QUOZEN_PREFIX.length), data };
        } catch (e: any) {
            return { valid: false, error: e.message };
        }
    }

    async getGroupData(spreadsheetId: string): Promise<GroupData | null> {
        if (!spreadsheetId) return null;
        const ranges = REQUIRED_SHEETS.map(s => `${s}!A2:Z`).join('&ranges=');
        try {
            const res = await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}/values:batchGet?majorDimension=ROWS&ranges=${ranges}`);
            const data = await res.json();
            if (!data.valueRanges) return null;

            const parseRows = (rows: any[][], schema: readonly string[]) => {
                return (rows || []).map((row, i) => {
                    const obj: any = { _rowIndex: i + 2 };
                    schema.forEach((key, idx) => {
                        let val = row[idx];
                        if (key === 'splits' || key === 'meta') {
                            try { val = JSON.parse(val); } catch { val = {}; }
                        } else if (key === 'amount' && val) val = parseFloat(val);
                        obj[key] = val;
                    });
                    return obj;
                });
            };

            return {
                expenses: parseRows(data.valueRanges[0].values, SCHEMAS.Expenses) as Expense[],
                settlements: parseRows(data.valueRanges[1].values, SCHEMAS.Settlements) as Settlement[],
                members: parseRows(data.valueRanges[2].values, SCHEMAS.Members) as Member[]
            };
        } catch { return null; }
    }

    async addExpense(spreadsheetId: string, expenseData: any): Promise<void> {
        const expense = { id: self.crypto.randomUUID(), ...expenseData, splits: expenseData.splits || [], meta: { createdAt: new Date().toISOString(), lastModified: new Date().toISOString() } };
        await this.addRow(spreadsheetId, "Expenses", expense);
    }

    async updateExpense(spreadsheetId: string, rowIndex: number, expenseData: Partial<Expense>, expectedLastModified?: string): Promise<void> {
        const sheet = "Expenses";
        const res = await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}/values/${sheet}!A${rowIndex}:Z${rowIndex}`);
        const data = await res.json();
        const row = data.values?.[0];
        if (!row) throw new NotFoundError();

        const currentId = row[0];
        if (currentId !== expenseData.id) throw new ConflictError("ID Mismatch");

        let meta = {};
        try { meta = JSON.parse(row[7]); } catch { }

        if (expectedLastModified && (meta as any).lastModified) {
            if (new Date((meta as any).lastModified).getTime() > new Date(expectedLastModified).getTime()) throw new ConflictError();
        }

        const updates = { ...expenseData, splits: expenseData.splits || [], meta: { ...meta, lastModified: new Date().toISOString() } };
        await this.updateRow(spreadsheetId, "Expenses", rowIndex, updates);
    }

    async deleteExpense(spreadsheetId: string, rowIndex: number, expenseId: string): Promise<void> {
        const res = await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}/values/Expenses!A${rowIndex}:Z${rowIndex}`);
        const data = await res.json();
        if (data.values?.[0]?.[0] !== expenseId) throw new ConflictError();
        await this.deleteRow(spreadsheetId, "Expenses", rowIndex);
    }

    async addSettlement(spreadsheetId: string, data: any): Promise<void> {
        const settlement = { id: self.crypto.randomUUID(), ...data, date: data.date || new Date().toISOString() };
        await this.addRow(spreadsheetId, "Settlements", settlement);
    }

    async addRow(spreadsheetId: string, sheetName: SchemaType, data: any): Promise<void> {
        const row = SCHEMAS[sheetName].map(k => {
            const v = data[k];
            return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : (v ?? "");
        });
        await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}/values/${sheetName}!A1:append?valueInputOption=USER_ENTERED`, {
            method: "POST",
            body: JSON.stringify({ values: [row] })
        });
    }

    async updateRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void> {
        const row = SCHEMAS[sheetName].map(k => {
            const v = data[k];
            return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : (v ?? "");
        });
        await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}/values/${sheetName}!A${rowIndex}:Z${rowIndex}?valueInputOption=USER_ENTERED`, {
            method: "PUT",
            body: JSON.stringify({ values: [row] })
        });
    }

    async deleteRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number): Promise<void> {
        const sheetId = await this.getSheetId(spreadsheetId, sheetName);
        await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}:batchUpdate`, {
            method: "POST",
            body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex - 1, endIndex: rowIndex } } }] })
        });
    }

    private async getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
        const key = `${spreadsheetId}:${sheetName}`;
        if (this.sheetIdCache.has(key)) return this.sheetIdCache.get(key)!;
        const res = await this.fetchWithAuth(`${SHEETS_API_URL}/${spreadsheetId}?fields=sheets.properties`);
        const data = await res.json();
        const sheet = data.sheets.find((s: any) => s.properties.title === sheetName);
        if (!sheet) throw new Error("Sheet not found");
        this.sheetIdCache.set(key, sheet.properties.sheetId);
        return sheet.properties.sheetId;
    }
}
