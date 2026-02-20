import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter, Member, Expense } from '../src';
import { StorageService } from '../src/storage/storage-service';
import { calculateBalances } from '../src/finance';

describe('Core Integration Flow', () => {
    let storage: StorageService;
    const user = { id: 'u1', username: 'alice', name: 'Alice', email: 'alice@example.com' };
    const bob = { username: 'Bob', email: 'bob@example.com' };

    beforeEach(() => {
        storage = new StorageService(new InMemoryAdapter());
    });

    it('should handle a full lifecycle: group creation, adding expense, and calculating balances', async () => {
        // 1. Create a group
        const group = await storage.createGroupSheet("Ski Trip", user, [bob]);
        expect(group.id).toBeDefined();

        // 2. Add an expense
        await storage.addExpense(group.id, {
            description: "Dinner",
            amount: 100,
            paidBy: 'u1',
            category: "Food",
            date: new Date().toISOString(),
            splits: [
                { userId: 'u1', amount: 50 },
                { userId: 'bob@example.com', amount: 50 }
            ]
        });

        // 3. Get group data
        const data = await storage.getGroupData(group.id);
        expect(data).not.toBeNull();
        expect(data?.expenses).toHaveLength(1);

        // 4. Calculate balances
        const members: Member[] = data!.members;
        const expenses: Expense[] = data!.expenses;
        const balances = calculateBalances(members, expenses, []);

        expect(balances['u1']).toBe(50); // Alice paid 100, consumed 50
        expect(balances['bob@example.com']).toBe(-50); // Bob consumed 50, paid 0
    });
});
