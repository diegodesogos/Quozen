import { Expense, Settlement, Member, GroupData } from "../types";
import {
    calculateBalances,
    calculateTotalSpent,
    getExpenseUserStatus,
    suggestSettlementStrategy,
    ExpenseUserStatus
} from "./index";

/**
 * GroupLedger provides a rich, object-oriented interface for analyzing group financial data.
 * It encapsulates raw data and provides memoized analytics to simplify UI implementation.
 */
export class GroupLedger {
    private readonly data: GroupData;
    private _balances: Record<string, number> | null = null;

    constructor(data: GroupData) {
        this.data = data;
    }

    /**
     * Gets all members in the group.
     */
    get members(): Member[] {
        return this.data.members;
    }

    /**
     * Gets all expenses in the group.
     */
    get expenses(): Expense[] {
        return this.data.expenses;
    }

    /**
     * Gets all settlements in the group.
     */
    get settlements(): Settlement[] {
        return this.data.settlements;
    }

    /**
     * Returns a map of user IDs to their net balances.
     * Positive = Owed money (Lent more than borrowed)
     * Negative = Owes money (Borrowed more than lent)
     */
    getBalances(): Record<string, number> {
        if (!this._balances) {
            this._balances = calculateBalances(
                this.data.members,
                this.data.expenses,
                this.data.settlements
            );
        }
        return this._balances;
    }

    /**
     * Returns the net balance for a specific user.
     */
    getUserBalance(userId: string): number {
        const balances = this.getBalances();
        return balances[userId] || 0;
    }

    /**
     * Returns the total amount a user has spent/borrowed across all expenses.
     */
    getTotalSpent(userId: string): number {
        return calculateTotalSpent(userId, this.data.expenses);
    }

    /**
     * Analyzes a specific expense from the perspective of a user.
     */
    getExpenseStatus(expenseId: string, userId: string): ExpenseUserStatus {
        const expense = this.data.expenses.find(e => e.id === expenseId);
        if (!expense) return { status: "none" };

        return getExpenseUserStatus(expense, userId);
    }

    /**
     * Suggests a settlement action for a user to move towards a zero balance.
     */
    getSettleUpSuggestion(userId: string) {
        const balances = this.getBalances();
        return suggestSettlementStrategy(userId, balances, this.data.members);
    }

    /**
     * Returns a summary of the group's financial health.
     */
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
