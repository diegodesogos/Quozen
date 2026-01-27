import { IStorageProvider, Group, User, GroupData, SCHEMAS, SchemaType, Expense, Settlement, Member, MemberInput } from "./types";

interface MockSheet {
    expenses: Expense[];
    settlements: Settlement[];
    members: Member[];
}

export class InMemoryProvider implements IStorageProvider {
    private sheets: Map<string, MockSheet> = new Map();
    private groups: Map<string, Group> = new Map();

    constructor() {
        // Optional: Pre-seed with some data if needed, or leave empty.
    }

    // --- Helpers ---
    private getSheet(id: string) {
        if (!this.sheets.has(id)) {
            throw new Error(`Sheet ${id} not found in memory`);
        }
        return this.sheets.get(id)!;
    }

    // --- Interface Implementation ---

    async listGroups(userEmail?: string): Promise<Group[]> {
        const allGroups = Array.from(this.groups.values());
        
        if (!userEmail) return allGroups;

        // Filter groups where user is a member
        const visibleGroups: Group[] = [];
        
        for (const group of allGroups) {
            const sheet = this.sheets.get(group.id);
            if (!sheet) continue;

            const isMember = sheet.members.some(m => m.email === userEmail);
            if (isMember) {
                // Determine ownership (Admin role or createdBy 'me' logic check)
                const isAdmin = sheet.members.some(m => m.email === userEmail && m.role === 'admin');
                
                visibleGroups.push({
                    ...group,
                    isOwner: isAdmin
                });
            }
        }

        return visibleGroups;
    }

    async createGroupSheet(name: string, user: User, members: MemberInput[] = []): Promise<Group> {
        const id = "mock-sheet-" + self.crypto.randomUUID();

        // Prepare initial members list
        const initialMembers: Member[] = [];

        // 1. Add Admin (Current User)
        initialMembers.push({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: "admin",
            joinedAt: new Date().toISOString(),
            _rowIndex: 2
        });

        // 2. Add other members
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

        this.sheets.set(id, {
            expenses: [],
            settlements: [],
            members: initialMembers
        });

        return group;
    }

    async updateGroup(groupId: string, name: string, members: MemberInput[]): Promise<void> {
        const group = this.groups.get(groupId);
        if (!group) throw new Error("Group not found");
        const sheet = this.getSheet(groupId);

        // 1. Update name
        group.name = name;

        // 2. Reconcile members
        // Logic similar to drive provider but synchronous on in-memory object
        const currentMembers = sheet.members;
        const desiredMembers = members.map(m => ({
            id: m.email || m.username || "",
            ...m
        })).filter(m => m.id);

        const processedIds = new Set<string>();

        // Add or match
        for (const desired of desiredMembers) {
            const existing = currentMembers.find(c =>
                (desired.email && c.email === desired.email) ||
                (desired.username && c.userId === desired.username)
            );

            if (existing) {
                processedIds.add(existing.userId);
            } else {
                // New
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

        // Remove
        // Filter in place
        const newMembersList = sheet.members.filter(m => processedIds.has(m.userId) || m.role === 'admin');

        // Re-assign and re-index
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
        
        // Expense check not strictly enforced here as it's a mock, but good to simulate logic if needed
        const hasExpenses = await this.checkMemberHasExpenses(groupId, userId);
        if (hasExpenses) throw new Error("Cannot leave group while involved in expenses. Please settle and remove expenses first.");

        sheet.members.splice(idx, 1);
        this.reindex(sheet.members, idx + 2); // approximate reindex
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
        // Mock validation
        if (this.groups.has(spreadsheetId)) {
            // Validate membership for mock
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
        return JSON.parse(JSON.stringify(sheet)); // Return copy
    }

    async addExpense(spreadsheetId: string, expenseData: any): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        const newExpense: Expense = {
            id: self.crypto.randomUUID(),
            ...expenseData,
            splits: expenseData.splits || [],
            meta: { createdAt: new Date().toISOString() },
            _rowIndex: sheet.expenses.length + 2 // 1 header + current items + 1 (new)
        };
        sheet.expenses.push(newExpense);
    }

    async deleteExpense(spreadsheetId: string, rowIndex: number): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        // rowIndex is 1-based index from Sheets. 
        // In our mock, we store _rowIndex. Find and remove.
        const idx = sheet.expenses.findIndex(e => e._rowIndex === rowIndex);
        if (idx !== -1) {
            sheet.expenses.splice(idx, 1);
            // Re-index subsequent rows to mimic sheets behavior if needed, 
            // strictly speaking Sheets shifts rows up.
            this.reindex(sheet.expenses, rowIndex);
        }
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

    async updateRow(spreadsheetId: string, sheetName: SchemaType, rowIndex: number, data: any): Promise<void> {
        const sheet = this.getSheet(spreadsheetId);
        const collection = sheet[sheetName.toLowerCase() as keyof MockSheet] as any[];

        const item = collection.find(i => i._rowIndex === rowIndex);
        if (!item) {
            // In sheets, if you update a row that doesn't exist but is within bounds, it works.
            // But here we expect it to exist usually.
            return;
        }

        // Update fields
        Object.assign(item, data);
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

    // --- Internal Helper ---
    private reindex(collection: any[], deletedRowIndex: number) {
        // All items with _rowIndex > deletedRowIndex should be decremented
        collection.forEach(item => {
            if (item._rowIndex > deletedRowIndex) {
                item._rowIndex--;
            }
        });
    }
}
