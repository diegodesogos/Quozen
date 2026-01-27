import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryProvider } from './memory-provider';
import { User } from './types';

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
        // 1. Setup
        const group = await provider.createGroupSheet("Original Name", mockUser, [{ username: "old-member" }]);
        let data = await provider.getGroupData(group.id);

        expect(data!.members).toHaveLength(2);

        // 2. Update
        await provider.updateGroup(group.id, "Updated Name", [{ username: "new-member" }]);

        // 3. Verify
        const groups = await provider.listGroups(mockUser.email);
        const updatedGroup = groups.find(g => g.id === group.id);
        expect(updatedGroup!.name).toBe("Updated Name");

        data = await provider.getGroupData(group.id);
        const memberNames = data!.members.map(m => m.name);
        expect(memberNames).toContain("Test User");
        expect(memberNames).toContain("new-member");
        expect(memberNames).not.toContain("old-member");
    });

    // --- Story 2.3 Tests (New) ---

    it('listGroups filters by user membership and sets isOwner correctly', async () => {
        // User 1 creates Group A
        const groupA = await provider.createGroupSheet("Group A", mockUser);
        
        // User 2 creates Group B, adds User 1 as member
        const user2: User = { id: 'user2', name: 'User Two', email: 'user2@example.com', username: 'user2' };
        const groupB = await provider.createGroupSheet("Group B", user2, [{ email: mockUser.email }]);

        // User 3 creates Group C, User 1 is NOT a member
        const user3: User = { id: 'user3', name: 'User Three', email: 'user3@example.com', username: 'user3' };
        await provider.createGroupSheet("Group C", user3);

        // Act: List groups for User 1
        const groups = await provider.listGroups(mockUser.email);

        // Assert: Should see Group A and Group B, but NOT Group C
        expect(groups).toHaveLength(2);
        
        const foundA = groups.find(g => g.id === groupA.id);
        const foundB = groups.find(g => g.id === groupB.id);

        expect(foundA).toBeDefined();
        expect(foundA!.isOwner).toBe(true); // Created by User 1

        expect(foundB).toBeDefined();
        expect(foundB!.isOwner).toBe(false); // Created by User 2, User 1 is member
    });
});
