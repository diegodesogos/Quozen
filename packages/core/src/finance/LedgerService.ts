import { LedgerRepository } from "../infrastructure/LedgerRepository";
import { User, Expense, Settlement, LedgerAnalytics } from "../domain/models";
import { CreateExpenseDTO } from "../domain/dtos";
import { calculateBalances, suggestSettlementStrategy } from "./index";

export class LedgerService {
    constructor(private repo: LedgerRepository, private user: User) { }

    async getExpenses(): Promise<Expense[]> {
        return this.repo.getExpenses();
    }

    async addExpense(payload: CreateExpenseDTO): Promise<Expense> {
        const members = await this.repo.getMembers();
        const isMember = members.some(m => m.userId === this.user.id || m.email === this.user.email);
        if (!isMember) throw new Error("Forbidden: User is not a member of this group");

        const expense: Expense = {
            id: (typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString()),
            description: payload.description,
            amount: payload.amount,
            category: payload.category,
            date: payload.date,
            paidByUserId: payload.paidByUserId,
            splits: payload.splits,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        await this.repo.addExpense(expense);
        return expense;
    }

    async getAnalytics(): Promise<LedgerAnalytics> {
        const expenses = await this.repo.getExpenses();
        const settlements = await this.repo.getSettlements();
        const members = await this.repo.getMembers();

        const mappedExpenses = expenses.map(e => ({ ...e, paidBy: e.paidByUserId }));
        const balances = calculateBalances(members as any, mappedExpenses as any, settlements as any);
        const totalVolume = expenses.reduce((sum, e) => sum + e.amount, 0);
        const suggestion = suggestSettlementStrategy(this.user.id, balances, members as any);

        return {
            balances,
            totalVolume,
            settlementSuggestions: suggestion ? [suggestion as unknown as Settlement] : []
        };
    }
}
