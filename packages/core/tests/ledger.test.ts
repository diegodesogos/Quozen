import { describe, it, expect, beforeEach } from 'vitest';
import { Ledger, LedgerData } from '../src/domain/Ledger';
import { Expense, Member, Settlement } from '../src/domain/models';

describe('Ledger (Domain)', () => {
    let mockData: LedgerData;
    let ledger: Ledger;

    beforeEach(() => {
        const members: Member[] = [
            { userId: 'u1', name: 'Alice', email: 'alice@example.com', role: 'owner', joinedAt: new Date() },
            { userId: 'u2', name: 'Bob', email: 'bob@example.com', role: 'member', joinedAt: new Date() },
            { userId: 'u3', name: 'Charlie', email: 'charlie@example.com', role: 'member', joinedAt: new Date() }
        ];

        const expenses: Expense[] = [
            {
                id: 'e1',
                description: 'Lunch',
                amount: 30,
                paidByUserId: 'u1',
                date: new Date('2023-01-01'),
                category: 'Food',
                splits: [
                    { userId: 'u1', amount: 10 },
                    { userId: 'u2', amount: 10 },
                    { userId: 'u3', amount: 10 }
                ],
                createdAt: new Date(),
                updatedAt: new Date()
            }
        ];

        const settlements: Settlement[] = [
            {
                id: 's1',
                fromUserId: 'u2',
                toUserId: 'u1',
                amount: 5,
                date: new Date('2023-01-02'),
                method: 'Cash'
            }
        ];

        mockData = { members, expenses, settlements };
        ledger = new Ledger(mockData);
    });

    it('should calculate balances correctly', () => {
        const balances = ledger.getBalances();
        // Alice paid 30, her split was 10. Others owe her 20. Bob paid back 5.
        // Alice: +20 - 5 = +15
        // Bob: -10 + 5 = -5
        // Charlie: -10
        expect(balances['u1']).toBe(15);
        expect(balances['u2']).toBe(-5);
        expect(balances['u3']).toBe(-10);
    });

    it('should return individual user balance', () => {
        expect(ledger.getUserBalance('u1')).toBe(15);
        expect(ledger.getUserBalance('u2')).toBe(-5);
        expect(ledger.getUserBalance('u3')).toBe(-10);
        expect(ledger.getUserBalance('non-existent')).toBe(0);
    });

    it('should calculate total spent for a user', () => {
        // Alice's split in e1 is 10.
        expect(ledger.getTotalSpent('u1')).toBe(10);
        expect(ledger.getTotalSpent('u2')).toBe(10);
    });

    it('should return expense status for a user', () => {
        const aliceStatus = ledger.getExpenseStatus('e1', 'u1');
        expect(aliceStatus).toEqual({
            status: 'payer',
            amountPaid: 30,
            lentAmount: 20
        });

        const bobStatus = ledger.getExpenseStatus('e1', 'u2');
        expect(bobStatus).toEqual({
            status: 'debtor',
            amountOwed: 10
        });
    });

    it('should suggest settlement strategy', () => {
        // Bob owes 5, Alice is owed 15. Suggest Bob pays Alice 5.
        const suggestion = ledger.getSettleUpSuggestion('u2');
        expect(suggestion).toEqual({
            fromUserId: 'u2',
            toUserId: 'u1',
            amount: 5
        });
    });

    it('should provide group summary', () => {
        const summary = ledger.getSummary();
        expect(summary).toEqual({
            totalVolume: 30,
            expenseCount: 1,
            settlementCount: 1,
            memberCount: 3,
            isBalanced: true
        });
    });
});
