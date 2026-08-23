import { Expense, Settlement, Member, ExpenseSplit } from "../domain/models";

export interface SheetRow<T> {
    entity: T;
    rowIndex: number;
}

export const SCHEMAS = {
    EXPENSES: 'Expenses!A:Z',
    SETTLEMENTS: 'Settlements!A:Z',
    GROUPS: 'Groups!A:Z',
    METADATA: 'Metadata!A:B'
};

export type HeaderMap = Record<string, number>;

export const DEFAULT_EXPENSE_MAP: HeaderMap = { id: 0, date: 1, description: 2, amount: 3, paidBy: 4, category: 5, splits: 6, meta: 7 };
export const DEFAULT_SETTLEMENT_MAP: HeaderMap = { id: 0, date: 1, fromUserId: 2, toUserId: 3, amount: 4, method: 5, notes: 6 };
export const DEFAULT_MEMBER_MAP: HeaderMap = { userId: 0, email: 1, name: 2, role: 3, joinedAt: 4 };


export class SheetDataMapper {
    static mapToExpense(row: any[], rowIndex: number, headerMap: HeaderMap = DEFAULT_EXPENSE_MAP): SheetRow<Expense> {
        const id = row[headerMap['id'] ?? 0];
        const date = row[headerMap['date'] ?? 1];
        const description = row[headerMap['description'] ?? 2];
        const amountRaw = row[headerMap['amount'] ?? 3];
        const paidByUserId = row[headerMap['paidBy'] ?? 4];
        const category = row[headerMap['category'] ?? 5];
        const splitsRaw = row[headerMap['splits'] ?? 6];
        const metaRaw = row[headerMap['meta'] ?? 7];

        let splits: ExpenseSplit[] = [];
        try {
            splits = typeof splitsRaw === 'string' ? JSON.parse(splitsRaw) : (splitsRaw || []);
        } catch {
            splits = [];
        }

        let meta: any = {};
        try {
            meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : (metaRaw || {});
        } catch {
            meta = {};
        }

        let amount = 0;
        if (amountRaw !== undefined && amountRaw !== null && amountRaw !== "") {
            amount = typeof amountRaw === 'string' ? parseFloat(amountRaw.replace(',', '.')) : parseFloat(String(amountRaw));
        }
        if (isNaN(amount)) amount = 0;

        const expense: Expense = {
            id: id || "",
            date: new Date(date || new Date()),
            description: description || "",
            amount,
            paidByUserId: paidByUserId || "",
            category: category || "",
            splits,
            createdAt: meta.createdAt ? new Date(meta.createdAt) : new Date(),
            updatedAt: meta.lastModified ? new Date(meta.lastModified) : new Date(),
        };

        return { entity: expense, rowIndex };
    }

    static mapFromExpense(expense: Expense, headerMap: HeaderMap = DEFAULT_EXPENSE_MAP): any[] {
        let maxIdx = 0;
        for (const idx of Object.values(headerMap)) {
            if (idx > maxIdx) maxIdx = idx;
        }
        const row = new Array(maxIdx + 1).fill("");

        if ('id' in headerMap) row[headerMap['id']] = expense.id;
        if ('date' in headerMap) row[headerMap['date']] = expense.date instanceof Date ? expense.date.toISOString() : new Date(expense.date).toISOString();
        if ('description' in headerMap) row[headerMap['description']] = expense.description;
        if ('amount' in headerMap) row[headerMap['amount']] = expense.amount;
        if ('paidBy' in headerMap) row[headerMap['paidBy']] = expense.paidByUserId;
        if ('category' in headerMap) row[headerMap['category']] = expense.category;
        if ('splits' in headerMap) row[headerMap['splits']] = JSON.stringify(expense.splits);
        if ('meta' in headerMap) row[headerMap['meta']] = JSON.stringify({
            createdAt: expense.createdAt.toISOString(),
            lastModified: expense.updatedAt.toISOString(),
        });

        return row;
    }

    static mapToSettlement(row: any[], rowIndex: number, headerMap: HeaderMap = DEFAULT_SETTLEMENT_MAP): SheetRow<Settlement> {
        const id = row[headerMap['id'] ?? 0];
        const date = row[headerMap['date'] ?? 1];
        const fromUserId = row[headerMap['fromUserId'] ?? 2];
        const toUserId = row[headerMap['toUserId'] ?? 3];
        const amountRaw = row[headerMap['amount'] ?? 4];
        const method = row[headerMap['method'] ?? 5];
        const notes = row[headerMap['notes'] ?? 6];

        let amount = 0;
        if (amountRaw !== undefined && amountRaw !== null && amountRaw !== "") {
            amount = typeof amountRaw === 'string' ? parseFloat(amountRaw.replace(',', '.')) : parseFloat(String(amountRaw));
        }
        if (isNaN(amount)) amount = 0;

        const settlement: Settlement = {
            id: id || "",
            date: new Date(date || new Date()),
            fromUserId: fromUserId || "",
            toUserId: toUserId || "",
            amount,
            method: method || "cash",
            notes: notes || "",
        };

        return { entity: settlement, rowIndex };
    }

    static mapFromSettlement(settlement: Settlement, headerMap: HeaderMap = DEFAULT_SETTLEMENT_MAP): any[] {
        let maxIdx = 0;
        for (const idx of Object.values(headerMap)) {
            if (idx > maxIdx) maxIdx = idx;
        }
        const row = new Array(maxIdx + 1).fill("");

        if ('id' in headerMap) row[headerMap['id']] = settlement.id;
        if ('date' in headerMap) row[headerMap['date']] = settlement.date instanceof Date ? settlement.date.toISOString() : new Date(settlement.date).toISOString();
        if ('fromUserId' in headerMap) row[headerMap['fromUserId']] = settlement.fromUserId;
        if ('toUserId' in headerMap) row[headerMap['toUserId']] = settlement.toUserId;
        if ('amount' in headerMap) row[headerMap['amount']] = settlement.amount;
        if ('method' in headerMap) row[headerMap['method']] = settlement.method;
        if ('notes' in headerMap) row[headerMap['notes']] = settlement.notes || "";

        return row;
    }

    static mapToMember(row: any[], rowIndex: number, headerMap: HeaderMap = DEFAULT_MEMBER_MAP): SheetRow<Member> {
        const userId = row[headerMap['userId'] ?? 0];
        const email = row[headerMap['email'] ?? 1];
        const name = row[headerMap['name'] ?? 2];
        const role = row[headerMap['role'] ?? 3];
        const joinedAt = row[headerMap['joinedAt'] ?? 4];

        const member: Member = {
            userId: userId || "",
            email: email || "",
            name: name || "",
            role: (role === "owner" || role === "member") ? role : "member",
            joinedAt: new Date(joinedAt || new Date()),
        };

        return { entity: member, rowIndex };
    }

    static mapFromMember(member: Member, headerMap: HeaderMap = DEFAULT_MEMBER_MAP): any[] {
        let maxIdx = 0;
        for (const idx of Object.values(headerMap)) {
            if (idx > maxIdx) maxIdx = idx;
        }
        const row = new Array(maxIdx + 1).fill("");

        if ('userId' in headerMap) row[headerMap['userId']] = member.userId;
        if ('email' in headerMap) row[headerMap['email']] = member.email;
        if ('name' in headerMap) row[headerMap['name']] = member.name;
        if ('role' in headerMap) row[headerMap['role']] = member.role;
        if ('joinedAt' in headerMap) row[headerMap['joinedAt']] = member.joinedAt.toISOString();

        return row;
    }
}
