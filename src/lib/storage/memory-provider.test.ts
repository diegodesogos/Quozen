import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService, InMemoryAdapter, IStorageProvider } from './index';
import { User, Expense } from './types';
import { ConflictError, NotFoundError } from '../errors';

describe('StorageService (with InMemoryAdapter)', () => {
    let provider: IStorageProvider;
    const mockUser: User = {
        id: 'user1',
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com'
    };

    beforeEach(() => {
        provider = new StorageService(new InMemoryAdapter());
    });

    it('createGroupSheet creates a new group and updates settings', async () => {
        const group = await provider.createGroupSheet("Test Group", mockUser);
        expect(group).toBeDefined();
        expect(group.name).toBe("Test Group");
        expect(group.isOwner).toBe(true);

        const settings = await provider.getSettings(mockUser.email);
        expect(settings.groupCache).toHaveLength(1);
        expect(settings.groupCache[0].id).toBe(group.id);
        expect(settings.groupCache[0].role).toBe("owner");
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

    it('updateGroup updates name and settings', async () => {
        const group = await provider.createGroupSheet("Original Name", mockUser, [{ username: "old-member" }]);

        await provider.updateGroup(group.id, "Updated Name", [{ username: "new-member" }], mockUser.email);

        const settings = await provider.getSettings(mockUser.email);
        const cached = settings.groupCache.find(g => g.id === group.id);
        expect(cached?.name).toBe("Updated Name");
    });

    it('deleteGroup removes from settings', async () => {
        const group = await provider.createGroupSheet("To Delete", mockUser);

        await provider.deleteGroup(group.id, mockUser.email);

        const settings = await provider.getSettings(mockUser.email);
        expect(settings.groupCache).toHaveLength(0);
    });

    it('getSettings initializes settings if file is missing (reconcileGroups)', async () => {
        // Create a group first
        await provider.createGroupSheet("Group Initial", mockUser);

        const settings = await provider.getSettings(mockUser.email);

        expect(settings.version).toBe(1);
        expect(settings.groupCache).toHaveLength(1);
        expect(settings.groupCache[0].name).toBe("Group Initial");
        expect(settings.preferences.defaultCurrency).toBe("USD");
    });
});
