import { describe, it, expect, beforeEach } from 'vitest';
import { QuozenClient, InMemoryAdapter, Member, Expense } from '../src';

describe('Core Integration Flow', () => {
    let client: QuozenClient;
    const user = { id: 'u1', username: 'alice', name: 'Alice', email: 'alice@example.com' };
    const bob = { username: 'Bob', email: 'bob@example.com' };

    beforeEach(() => {
        const storage = new InMemoryAdapter();
        client = new QuozenClient({ storage, user });
    });

    it('should handle a full lifecycle: group creation, adding expense, and calculating balances', async () => {
        // 1. Create a group
        const group = await client.groups.create("Ski Trip", [bob]);
        expect(group.id).toBeDefined();

        // 2. Add an expense
        const ledger = client.ledger(group.id);
        await ledger.addExpense({
            description: "Dinner",
            amount: 100,
            paidBy: 'u1',
            category: "Food",
            date: new Date().toISOString(),
            splits: [
                { userId: 'u1', amount: 50 },
                { userId: 'bob', amount: 50 } // ID assigned during creation
            ]
        });

        // 3. Get group data
        const expenses = await ledger.getExpenses();
        const members = await ledger.getMembers();
        expect(expenses).toHaveLength(1);

        // 4. Calculate balances
        const status = ledger.getUserStatus('u1', members, expenses, []);

        expect(status.balance).toBe(50); // Alice paid 100, consumed 50
    });
});
