import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryProvider } from './memory-provider';
import { User, Expense } from './types';
import { ConflictError, NotFoundError } from '../errors';

describe('InMemoryProvider', () => {
    let provider: InMemoryProvider;
    const mockUser: User = {
        id: 'user1',
        username: 'testuser',
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
        expect(group.isOwner).toBe(true);

        const groups = await provider.listGroups(mockUser.email);
        expect(groups).toHaveLength(1);
        expect(groups[0].id).toBe(group.id);
        expect(groups[0].isOwner).toBe(true);
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
        const expense = data!.expenses[0];
        const rowIndex = expense._rowIndex!;

        await provider.deleteExpense(group.id, rowIndex, expense.id);

        data = await provider.getGroupData(group.id);
        expect(data!.expenses).toHaveLength(0);
    });

    // --- Story 2.2 Tests ---

    it('checkMemberHasExpenses returns true if member paid', async () => {
        const group = await provider.createGroupSheet("Test Group", mockUser);
        await provider.addExpense(group.id, {
            description: "Lunch",
            amount: 20,
            paidBy: "user1"
        });

        const hasExpenses = await provider.checkMemberHasExpenses(group.id, "user1");
        expect(hasExpenses).toBe(true);
    });

    it('checkMemberHasExpenses returns true if member is in split', async () => {
        const group = await provider.createGroupSheet("Test Group", mockUser);
        await provider.addExpense(group.id, {
            description: "Lunch",
            amount: 20,
            paidBy: "user1",
            splits: [{ userId: "other-user", amount: 10 }]
        });

        const hasExpenses = await provider.checkMemberHasExpenses(group.id, "other-user");
        expect(hasExpenses).toBe(true);
    });

    it('checkMemberHasExpenses returns false for uninvolved member', async () => {
        const group = await provider.createGroupSheet("Test Group", mockUser);
        await provider.addExpense(group.id, {
            description: "Lunch",
            amount: 20,
            paidBy: "user1"
        });

        const hasExpenses = await provider.checkMemberHasExpenses(group.id, "unused-user");
        expect(hasExpenses).toBe(false);
    });

    it('updateGroup updates name and members', async () => {
        const group = await provider.createGroupSheet("Original Name", mockUser, [{ username: "old-member" }]);
        let data = await provider.getGroupData(group.id);

        expect(data!.members).toHaveLength(2);

        await provider.updateGroup(group.id, "Updated Name", [{ username: "new-member" }]);

        const groups = await provider.listGroups(mockUser.email);
        const updatedGroup = groups.find(g => g.id === group.id);
        expect(updatedGroup!.name).toBe("Updated Name");

        data = await provider.getGroupData(group.id);
        const memberNames = data!.members.map(m => m.name);
        expect(memberNames).toContain("Test User");
        expect(memberNames).toContain("new-member");
        expect(memberNames).not.toContain("old-member");
    });

    // --- Story 2.3 Tests ---

    it('listGroups filters by user membership and sets isOwner correctly', async () => {
        const groupA = await provider.createGroupSheet("Group A", mockUser);
        
        const user2: User = { id: 'user2', name: 'User Two', email: 'user2@example.com', username: 'user2' };
        const groupB = await provider.createGroupSheet("Group B", user2, [{ email: mockUser.email }]);

        const user3: User = { id: 'user3', name: 'User Three', email: 'user3@example.com', username: 'user3' };
        await provider.createGroupSheet("Group C", user3);

        const groups = await provider.listGroups(mockUser.email);

        expect(groups).toHaveLength(2);
        
        const foundA = groups.find(g => g.id === groupA.id);
        const foundB = groups.find(g => g.id === groupB.id);

        expect(foundA).toBeDefined();
        expect(foundA!.isOwner).toBe(true); 

        expect(foundB).toBeDefined();
        expect(foundB!.isOwner).toBe(false); 
    });

    // --- Story 2.7 & 2.8 Tests (New) ---

    it('updateExpense throws ConflictError if data was modified on server', async () => {
        const group = await provider.createGroupSheet("Conflict Group", mockUser);
        await provider.addExpense(group.id, { description: "Original", amount: 10, paidBy: "user1" });

        let data = await provider.getGroupData(group.id);
        const expense = data!.expenses[0];
        const oldTimestamp = expense.meta.lastModified;

        // Simulate a newer update on the server
        await new Promise(r => setTimeout(r, 10)); 
        await provider.updateExpense(
            group.id, 
            expense._rowIndex!, 
            { id: expense.id, description: "Server Update", amount: 20 }
        );
        
        // Now try to update with the OLD timestamp
        await expect(provider.updateExpense(
            group.id, 
            expense._rowIndex!, 
            { id: expense.id, description: "Client Update", amount: 30 },
            oldTimestamp
        )).rejects.toThrow(ConflictError);
    });

    it('updateExpense updates lastModified on success', async () => {
        const group = await provider.createGroupSheet("Update Group", mockUser);
        await provider.addExpense(group.id, { description: "Original", amount: 10, paidBy: "user1" });

        let data = await provider.getGroupData(group.id);
        const expense = data!.expenses[0];
        const initialTs = expense.meta.lastModified;

        await new Promise(r => setTimeout(r, 10)); 
        await provider.updateExpense(
            group.id, 
            expense._rowIndex!, 
            { id: expense.id, description: "New" }, 
            initialTs
        );

        data = await provider.getGroupData(group.id);
        const updatedExpense = data!.expenses[0];
        
        expect(updatedExpense.description).toBe("New");
        expect(new Date(updatedExpense.meta.lastModified!).getTime()).toBeGreaterThan(new Date(initialTs!).getTime());
    });

    it('deleteExpense throws NotFoundError if row is missing', async () => {
        const group = await provider.createGroupSheet("Delete Group", mockUser);
        await expect(provider.deleteExpense(group.id, 999, "some-id")).rejects.toThrow(NotFoundError);
    });

    it('deleteExpense throws ConflictError if ID mismatches (shifted rows)', async () => {
        const group = await provider.createGroupSheet("Delete Conflict Group", mockUser);
        await provider.addExpense(group.id, { description: "Exp 1", amount: 10, paidBy: "user1" });
        await provider.addExpense(group.id, { description: "Exp 2", amount: 20, paidBy: "user1" });

        let data = await provider.getGroupData(group.id);
        const exp1 = data!.expenses[0];
        const exp2 = data!.expenses[1];

        // Mismatch: Try to delete Exp 2 by using Exp 1's Row Index but passing Exp 2's ID
        await expect(provider.deleteExpense(group.id, exp1._rowIndex!, exp2.id)).rejects.toThrow(ConflictError);
    });
});
