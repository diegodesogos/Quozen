import { Expense, Settlement, Member } from "./models";
import { calculateBalances, calculateTotalSpent, getExpenseUserStatus, suggestSettlementStrategy, ExpenseUserStatus } from "../finance";

export interface LedgerData {
    expenses: Expense[];
    settlements: Settlement[];
    members: Member[];
}

export class Ledger {
    private _balances: Record<string, number> | null = null;

    constructor(private data: LedgerData) { }

    get members(): Member[] { return this.data.members; }
    get expenses(): Expense[] { return this.data.expenses; }
    get settlements(): Settlement[] { return this.data.settlements; }

    getBalances(): Record<string, number> {
        if (!this._balances) {
            const mappedExpenses = this.data.expenses.map(e => ({ ...e, paidBy: e.paidByUserId }));
            // @ts-ignore: Intentionally passing mapped domain models to math functions expecting legacy types
            this._balances = calculateBalances(this.data.members, mappedExpenses, this.data.settlements);
        }
        return this._balances;
    }

    getUserBalance(userId: string): number {
        return this.getBalances()[userId] || 0;
    }

    getTotalSpent(userId: string): number {
        const mappedExpenses = this.data.expenses.map(e => ({ ...e, paidBy: e.paidByUserId }));
        // @ts-ignore
        return calculateTotalSpent(userId, mappedExpenses);
    }

    getExpenseStatus(expenseId: string, userId: string): ExpenseUserStatus {
        const expense = this.data.expenses.find(e => e.id === expenseId);
        if (!expense) return { status: "none" };
        const mappedExpense = { ...expense, paidBy: expense.paidByUserId };
        // @ts-ignore
        return getExpenseUserStatus(mappedExpense, userId);
    }

    getSettleUpSuggestion(userId: string) {
        // @ts-ignore
        return suggestSettlementStrategy(userId, this.getBalances(), this.data.members);
    }

    getSummary() {
        const balances = this.getBalances();
        const totalVolume = this.data.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        return {
            totalVolume,
            expenseCount: this.data.expenses.length,
            settlementCount: this.data.settlements.length,
            memberCount: this.data.members.length,
            isBalanced: Math.abs(Object.values(balances).reduce((a, b) => a + b, 0)) < 0.01
        };
    }
}
