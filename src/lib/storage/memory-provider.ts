import { IStorageProvider, Group, User, GroupData, SCHEMAS, SchemaType, Expense, Settlement, Member, MemberInput, UserSettings } from "./types";
import { ConflictError, NotFoundError } from "../errors";

interface MockSheet {
    expenses: Expense[];
    settlements: Settlement[];
    members: Member[];
}

export class InMemoryProvider implements IStorageProvider {
    private sheets: Map<string, MockSheet> = new Map();
    private groups: Map<string, Group> = new Map();
    private userSettings: Map<string, UserSettings> = new Map();

    constructor() { }

    private getSheet(id: string) {
        if (!this.sheets.has(id)) throw new Error(`Sheet ${id} not found in memory`);
        return this.sheets.get(id)!;
    }

    async createGroupSheet(name: string, user: User, members: MemberInput[] = []): Promise<Group> {
        const id = "mock-sheet-" + self.crypto.randomUUID();
        const initialMembers: Member[] = [];

        initialMembers.push({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: "owner", // Changed from admin to owner
            joinedAt: new Date().toISOString(),
            _rowIndex: 2
        });

        for (const member of members) {
            const memberId = member.email || member.username || `user-${self.crypto.randomUUID()}`;
            initialMembers.push({
                userId: memberId,
                email: member.email || "",
                name: member.username || member.email || "Unknown",
                role: "member",
                joinedAt: new Date().toISOString(),
                _rowIndex: initialMembers.length + 2
            });
        }

        const group: Group = {
            id,
            name,
            description: "Mock Sheet Group",
            createdBy: "me",
            participants: initialMembers.map(m => m.userId),
            createdAt: new Date().toISOString(),
            isOwner: true
        };

        this.groups.set(id, group);
        this.sheets.set(id, { expenses: [], settlements: [], members: initialMembers });

        // Auto-update settings
        if (user.email) {
            const settings = await this.getSettings(user.email);
            settings.groupCache.unshift({ id: group.id, name: group.name, role: "owner", lastAccessed: new Date().toISOString() });
            settings.activeGroupId = group.id;
            await this.saveSettings(settings);
        }

        return group;
    }

    async importGroup(spreadsheetId: string, userEmail: string): Promise<Group> {
        if (!this.groups.has(spreadsheetId)) throw new Error("Group not found");

        const group = this.groups.get(spreadsheetId)!;
        const settings = await this.getSettings(userEmail);
        const sheet = this.getSheet(spreadsheetId);

        if (!settings.groupCache.some(g => g.id === spreadsheetId)) {
            settings.groupCache.unshift({ id: spreadsheetId, name: group.name, role: "member", lastAccessed: new Date().toISOString() });
            settings.activeGroupId = spreadsheetId;
            await this.saveSettings(settings);
        }
        return group;
    }

    async updateGroup(groupId: string, name: string, members: MemberInput[], userEmail: string): Promise<void> {
        const group = this.groups.get(groupId);
        if (!group) throw new Error("Group not found");
        const sheet = this.getSheet(groupId);

        group.name = name;

        // Update Settings if name changed
        const settings = await this.getSettings(userEmail);
        const cached = settings.groupCache.find(g => g.id === groupId);
        if (cached) {
            cached.name = name;
            await this.saveSettings(settings);
        }
    }

    async deleteGroup(groupId: string, userEmail: string): Promise<void> {
        this.groups.delete(groupId);
        this.sheets.delete(groupId);

        const settings = await this.getSettings(userEmail);
        settings.groupCache = settings.groupCache.filter(g => g.id !== groupId);
        if (settings.activeGroupId === groupId) settings.activeGroupId = settings.groupCache[0]?.id || null;
        await this.saveSettings(settings);
    }

    async leaveGroup(groupId: string, userId: string, userEmail: string): Promise<void> {
        const sheet = this.getSheet(groupId);

        // Find by ID OR Email
        const idx = sheet.members.findIndex(m => m.userId === userId || (userEmail && m.email === userEmail));
        if (idx === -1) throw new Error("Member not found");

        const member = sheet.members[idx];
        // Updated check: 'owner' role
        if (member.role === 'owner') throw new Error("Owners cannot leave.");

        // Check using the FOUND member's ID
        if (await this.checkMemberHasExpenses(groupId, member.userId)) throw new Error("Cannot leave with expenses.");

        sheet.members.splice(idx, 1);

        const settings = await this.getSettings(userEmail);
        settings.groupCache = settings.groupCache.filter(g => g.id !== groupId);
        if (settings.activeGroupId === groupId) settings.activeGroupId = settings.groupCache[0]?.id || null;
        await this.saveSettings(settings);
    }

    // ... Standard methods ...

    async checkMemberHasExpenses(groupId: string, userId: string): Promise<boolean> {
        const sheet = this.getSheet(groupId);
        return sheet.expenses.some(e => e.paidBy === userId || e.splits.some((s: any) => s.userId === userId && s.amount > 0));
    }

    async validateQuozenSpreadsheet(spreadsheetId: string, userEmail: string): Promise<{ valid: boolean; error?: string; name?: string; data?: GroupData }> {
        if (this.groups.has(spreadsheetId)) {
            const data = await this.getGroupData(spreadsheetId);
            return { valid: true, name: this.groups.get(spreadsheetId)!.name, data: data! };
        }
        return { valid: false, error: "Not found" };
    }

    async getGroupData(spreadsheetId: string): Promise<GroupData | null> {
        const sheet = this.sheets.get(spreadsheetId);
        return sheet ? JSON.parse(JSON.stringify(sheet)) : null;
    }

    async addExpense(spreadsheetId: string, expenseData: any): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        const expense = { id: self.crypto.randomUUID(), ...expenseData, splits: expenseData.splits || [], meta: { createdAt: new Date().toISOString(), lastModified: new Date().toISOString() }, _rowIndex: sheet.expenses.length + 2 };
        sheet.expenses.push(expense);
    }

    async updateExpense(spreadsheetId: string, rowIndex: number, expenseData: Partial<Expense>, expectedLastModified?: string): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        const expense = sheet.expenses.find(e => e._rowIndex === rowIndex);
        if (!expense) throw new NotFoundError();
        if (expectedLastModified && expense.meta.lastModified && new Date(expense.meta.lastModified).getTime() > new Date(expectedLastModified).getTime()) throw new ConflictError();
        Object.assign(expense, { ...expenseData, meta: { ...expense.meta, lastModified: new Date().toISOString() } });
    }

    async deleteExpense(spreadsheetId: string, rowIndex: number, expenseId: string): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        const idx = sheet.expenses.findIndex(e => e._rowIndex === rowIndex);
        if (idx === -1) throw new NotFoundError();
        if (sheet.expenses[idx].id !== expenseId) throw new ConflictError();
        sheet.expenses.splice(idx, 1);
    }

    async addSettlement(spreadsheetId: string, settlementData: any): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        sheet.settlements.push({ id: self.crypto.randomUUID(), ...settlementData });
    }

    async updateRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void> {
        // Generic mock update
        const sheet = this.getSheet(spreadsheetId);
        if (sheetName === 'Members') {
            const idx = sheet.members.findIndex(m => m._rowIndex === rowIndex);
            if (idx !== -1) sheet.members[idx] = { ...sheet.members[idx], ...data };
        }
    }

    async deleteRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        const collection = sheetName === 'Expenses' ? sheet.expenses : sheetName === 'Settlements' ? sheet.settlements : sheet.members;
        const idx = collection.findIndex((i: any) => i._rowIndex === rowIndex);
        if (idx > -1) collection.splice(idx, 1);
    }

    async getSettings(userEmail: string): Promise<UserSettings> {
        if (!this.userSettings.has(userEmail)) {
            return this.reconcileGroups(userEmail);
        }
        return this.userSettings.get(userEmail)!;
    }

    async saveSettings(settings: UserSettings): Promise<void> {
        // Simplified: find matching email or just iterate (limit of mock)
        for (const [key] of this.userSettings) {
            this.userSettings.set(key, settings);
        }
    }

    async updateActiveGroup(userEmail: string, groupId: string): Promise<void> {
        const settings = await this.getSettings(userEmail);
        settings.activeGroupId = groupId;
        const cached = settings.groupCache.find(g => g.id === groupId);
        if (cached) cached.lastAccessed = new Date().toISOString();
        await this.saveSettings(settings);
    }

    async reconcileGroups(userEmail: string): Promise<UserSettings> {
        const settings: UserSettings = {
            version: 1,
            activeGroupId: null,
            groupCache: [],
            preferences: { defaultCurrency: "USD", theme: "system" },
            lastUpdated: new Date().toISOString()
        };
        this.userSettings.set(userEmail, settings);
        return settings;
    }
}
