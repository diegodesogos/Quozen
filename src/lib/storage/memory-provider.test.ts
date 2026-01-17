
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryProvider } from './memory-provider';
import { User } from './types';

describe('InMemoryProvider', () => {
    let provider: InMemoryProvider;
    const mockUser: User = {
        id: 'user1',
        name: 'Test User',
        email: 'test@example.com'
    };

    beforeEach(() => {
        provider = new InMemoryProvider();
    });

    it('createGroupSheet creates a new group and returns it', async () => {
        const group = await provider.createGroupSheet("Test Group", mockUser);
        expect(group).toBeDefined();
        expect(group.name).toBe("Test Group");
        expect(group.participants).toContain(mockUser.id);

        const groups = await provider.listGroups();
        expect(groups).toHaveLength(1);
        expect(groups[0].id).toBe(group.id);
    });

    it('addExpense adds an expense to the group', async () => {
        const group = await provider.createGroupSheet("Test Group", mockUser);

        const expenseData = {
            description: "Lunch",
            amount: 20,
            paidBy: "user1",
            category: "Food",
            date: "2023-01-01"
        };

        await provider.addExpense(group.id, expenseData);

        const data = await provider.getGroupData(group.id);
        expect(data).not.toBeNull();
        expect(data!.expenses).toHaveLength(1);
        expect(data!.expenses[0].description).toBe("Lunch");
        expect(data!.expenses[0].amount).toBe(20);
        expect(data!.expenses[0]._rowIndex).toBeDefined();
    });

    it('updateRow updates an existing expense', async () => {
        const group = await provider.createGroupSheet("Test Group", mockUser);
        await provider.addExpense(group.id, { description: "Old", amount: 10, paidBy: "user1" });

        // Get the expense to find rowIndex
        let data = await provider.getGroupData(group.id);
        const expense = data!.expenses[0];

        await provider.updateRow(group.id, "Expenses", expense._rowIndex!, { description: "New", amount: 15 });

        data = await provider.getGroupData(group.id);
        expect(data!.expenses[0].description).toBe("New");
        expect(data!.expenses[0].amount).toBe(15);
    });

    it('deleteExpense removes the expense', async () => {
        const group = await provider.createGroupSheet("Test Group", mockUser);
        await provider.addExpense(group.id, { description: "To Delete", amount: 10, paidBy: "user1" });

        let data = await provider.getGroupData(group.id);
        const rowIndex = data!.expenses[0]._rowIndex!;

        await provider.deleteExpense(group.id, rowIndex);

        data = await provider.getGroupData(group.id);
        expect(data!.expenses).toHaveLength(0);
    });
});
