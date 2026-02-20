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

export class SheetDataMapper {
    static mapToExpense(row: any[], rowIndex: number): SheetRow<Expense> {
        const [id, date, description, amountRaw, paidByUserId, category, splitsRaw, metaRaw] = row;

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

    static mapFromExpense(expense: Expense): any[] {
        return [
            expense.id,
            expense.date instanceof Date ? expense.date.toISOString() : new Date(expense.date).toISOString(),
            expense.description,
            expense.amount,
            expense.paidByUserId,
            expense.category,
            JSON.stringify(expense.splits),
            JSON.stringify({
                createdAt: expense.createdAt.toISOString(),
                lastModified: expense.updatedAt.toISOString(),
            }),
        ];
    }

    static mapToSettlement(row: any[], rowIndex: number): SheetRow<Settlement> {
        const [id, date, fromUserId, toUserId, amountRaw, method, notes] = row;

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

    static mapFromSettlement(settlement: Settlement): any[] {
        return [
            settlement.id,
            settlement.date instanceof Date ? settlement.date.toISOString() : new Date(settlement.date).toISOString(),
            settlement.fromUserId,
            settlement.toUserId,
            settlement.amount,
            settlement.method,
            settlement.notes || "",
        ];
    }

    static mapToMember(row: any[], rowIndex: number): SheetRow<Member> {
        const [userId, email, name, role, joinedAt] = row;

        const member: Member = {
            userId: userId || "",
            email: email || "",
            name: name || "",
            role: (role === "owner" || role === "member") ? role : "member",
            joinedAt: new Date(joinedAt || new Date()),
        };

        return { entity: member, rowIndex };
    }

    static mapFromMember(member: Member): any[] {
        return [
            member.userId,
            member.email,
            member.name,
            member.role,
            member.joinedAt.toISOString(),
        ];
    }
}
