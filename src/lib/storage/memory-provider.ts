import { IStorageProvider, Group, User, GroupData, SCHEMAS, SchemaType, Expense, Settlement, Member, MemberInput } from "./types";
import { ConflictError, NotFoundError } from "../errors";

interface MockSheet {
    expenses: Expense[];
    settlements: Settlement[];
    members: Member[];
}

export class InMemoryProvider implements IStorageProvider {
    private sheets: Map<string, MockSheet> = new Map();
    private groups: Map<string, Group> = new Map();

    constructor() {}

    private getSheet(id: string) {
        if (!this.sheets.has(id)) {
            throw new Error(`Sheet ${id} not found in memory`);
        }
        return this.sheets.get(id)!;
    }

    async listGroups(userEmail?: string): Promise<Group[]> {
        const allGroups = Array.from(this.groups.values());
        if (!userEmail) return allGroups;

        const visibleGroups: Group[] = [];
        for (const group of allGroups) {
            const sheet = this.sheets.get(group.id);
            if (!sheet) continue;
            const isMember = sheet.members.some(m => m.email === userEmail);
            if (isMember) {
                const isAdmin = sheet.members.some(m => m.email === userEmail && m.role === 'admin');
                visibleGroups.push({ ...group, isOwner: isAdmin });
            }
        }
        return visibleGroups;
    }

    async createGroupSheet(name: string, user: User, members: MemberInput[] = []): Promise<Group> {
        const id = "mock-sheet-" + self.crypto.randomUUID();
        const initialMembers: Member[] = [];

        initialMembers.push({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: "admin",
            joinedAt: new Date().toISOString(),
            _rowIndex: 2
        });

        let rowIndex = 3;
        const participantIds = [user.id];

        for (const member of members) {
            const memberId = member.email || member.username || `user-${self.crypto.randomUUID()}`;
            const memberName = member.username || member.email || "Unknown";

            initialMembers.push({
                userId: memberId,
                email: member.email || "",
                name: memberName,
                role: "member",
                joinedAt: new Date().toISOString(),
                _rowIndex: rowIndex++
            });
            participantIds.push(memberId);
        }

        const group: Group = {
            id,
            name,
            description: "Mock Sheet Group",
            createdBy: "me",
            participants: participantIds,
            createdAt: new Date().toISOString(),
            isOwner: true
        };

        this.groups.set(id, group);
        this.sheets.set(id, { expenses: [], settlements: [], members: initialMembers });
        return group;
    }

    async updateGroup(groupId: string, name: string, members: MemberInput[]): Promise<void> {
        const group = this.groups.get(groupId);
        if (!group) throw new Error("Group not found");
        const sheet = this.getSheet(groupId);

        group.name = name;

        const currentMembers = sheet.members;
        const desiredMembers = members.map(m => ({
            id: m.email || m.username || "",
            ...m
        })).filter(m => m.id);

        const processedIds = new Set<string>();

        for (const desired of desiredMembers) {
            const existing = currentMembers.find(c =>
                (desired.email && c.email === desired.email) ||
                (desired.username && c.userId === desired.username)
            );

            if (existing) {
                processedIds.add(existing.userId);
            } else {
                const memberId = desired.email || desired.username || `user-${self.crypto.randomUUID()}`;
                sheet.members.push({
                    userId: memberId,
                    email: desired.email || "",
                    name: desired.username || desired.email || "Unknown",
                    role: "member",
                    joinedAt: new Date().toISOString(),
                    _rowIndex: sheet.members.length + 2
                });
                processedIds.add(memberId);
            }
        }

        const newMembersList = sheet.members.filter(m => processedIds.has(m.userId) || m.role === 'admin');
        sheet.members = newMembersList.map((m, i) => ({ ...m, _rowIndex: i + 2 }));
    }

    async deleteGroup(groupId: string): Promise<void> {
        this.groups.delete(groupId);
        this.sheets.delete(groupId);
    }

    async leaveGroup(groupId: string, userId: string): Promise<void> {
        const sheet = this.getSheet(groupId);
        const idx = sheet.members.findIndex(m => m.userId === userId);
        
        if (idx === -1) throw new Error("Member not found");
        const hasExpenses = await this.checkMemberHasExpenses(groupId, userId);
        if (hasExpenses) throw new Error("Cannot leave group while involved in expenses.");

        sheet.members.splice(idx, 1);
        this.reindex(sheet.members, idx + 2);
    }

    async checkMemberHasExpenses(groupId: string, userId: string): Promise<boolean> {
        const sheet = this.getSheet(groupId);
        return sheet.expenses.some(e => {
            if (e.paidBy === userId) return true;
            if (e.splits && e.splits.some((s: any) => s.userId === userId && s.amount > 0)) return true;
            return false;
        });
    }

    async validateQuozenSpreadsheet(
        spreadsheetId: string,
        userEmail: string
    ): Promise<{ valid: boolean; error?: string; name?: string }> {
        if (this.groups.has(spreadsheetId)) {
            const sheet = this.sheets.get(spreadsheetId)!;
            const isMember = sheet.members.some(m => m.email === userEmail);
            if (!isMember) return { valid: false, error: "Not a member" };
            return { valid: true, name: this.groups.get(spreadsheetId)!.name };
        }
        return { valid: false, error: "Mock sheet not found" };
    }

    async getGroupData(spreadsheetId: string): Promise<GroupData | null> {
        const sheet = this.sheets.get(spreadsheetId);
        if (!sheet) return null;
        return JSON.parse(JSON.stringify(sheet));
    }

    async addExpense(spreadsheetId: string, expenseData: any): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        const newExpense: Expense = {
            id: self.crypto.randomUUID(),
            ...expenseData,
            splits: expenseData.splits || [],
            meta: { 
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString()
            },
            _rowIndex: sheet.expenses.length + 2
        };
        sheet.expenses.push(newExpense);
    }

    async deleteExpense(spreadsheetId: string, rowIndex: number, expenseId: string): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        const idx = sheet.expenses.findIndex(e => e._rowIndex === rowIndex);
        
        if (idx === -1) {
            throw new NotFoundError("Expense not found.");
        }

        const expense = sheet.expenses[idx];
        if (expense.id !== expenseId) {
            throw new ConflictError("Expense location mismatch.");
        }

        sheet.expenses.splice(idx, 1);
        this.reindex(sheet.expenses, rowIndex);
    }

    async addSettlement(spreadsheetId: string, settlementData: any): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        const newSettlement: Settlement = {
            id: self.crypto.randomUUID(),
            ...settlementData,
            date: settlementData.date || new Date().toISOString(),
            _rowIndex: sheet.settlements.length + 2
        };
        sheet.settlements.push(newSettlement);
    }

    async updateExpense(
        spreadsheetId: string, 
        rowIndex: number, 
        expenseData: Partial<Expense>, 
        expectedLastModified?: string
    ): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        const expense = sheet.expenses.find(e => e._rowIndex === rowIndex);

        if (!expense) throw new NotFoundError("Expense not found");
        if (expense.id !== expenseData.id) throw new ConflictError("Expense ID mismatch");

        if (expectedLastModified && expense.meta?.lastModified) {
            if (new Date(expense.meta.lastModified).getTime() > new Date(expectedLastModified).getTime()) {
                throw new ConflictError("Expense modified by another user");
            }
        }

        Object.assign(expense, expenseData);
        if (!expense.meta) expense.meta = { createdAt: new Date().toISOString() };
        expense.meta.lastModified = new Date().toISOString();
    }

    async updateRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        const collection = sheet[sheetName.toLowerCase() as keyof MockSheet] as any[];
        const item = collection.find(i => i._rowIndex === rowIndex);
        if (item) Object.assign(item, data);
    }

    async deleteRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        const collection = sheet[sheetName.toLowerCase() as keyof MockSheet] as any[];
        const idx = collection.findIndex(i => i._rowIndex === rowIndex);
        if (idx !== -1) {
            collection.splice(idx, 1);
            this.reindex(collection, rowIndex);
        }
    }

    private reindex(collection: any[], deletedRowIndex: number) {
        collection.forEach(item => {
            if (item._rowIndex && item._rowIndex > deletedRowIndex) {
                item._rowIndex--;
            }
        });
    }
}
