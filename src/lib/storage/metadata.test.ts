import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from './storage-service';
import { InMemoryAdapter } from './memory-adapter';
import { User, QUOZEN_PREFIX } from './types';

describe('StorageService Metadata & Reconciliation', () => {
    let adapter: InMemoryAdapter;
    let service: StorageService;
    const user: User = {
        id: 'u1',
        name: 'Test User',
        email: 'test@example.com',
        username: 'test'
    };

    beforeEach(() => {
        adapter = new InMemoryAdapter();
        service = new StorageService(adapter);
    });

    it('US-201: Creates group with metadata stamp', async () => {
        const group = await service.createGroupSheet("New Group", user);

        const meta = await adapter.getFileMeta(group.id);
        expect(meta.properties).toBeDefined();
        expect(meta.properties?.['quozen_type']).toBe('group');
        expect(meta.properties?.['version']).toBe('1.0');
    });

    it('US-202: Strict Reconciliation ignores files without metadata', async () => {
        // 1. Create a valid group via service (Stamps it)
        const validGroup = await service.createGroupSheet("Valid Group", user);

        // 2. Create a legacy/corrupt file via adapter directly (No Stamp)
        await adapter.createFile(QUOZEN_PREFIX + "Invalid Group", ["Expenses", "Settlements", "Members"]);

        // 3. Reconcile
        const settings = await service.reconcileGroups(user.email);

        // 4. Verify only valid group is found
        expect(settings.groupCache).toHaveLength(1);
        expect(settings.groupCache[0].id).toBe(validGroup.id);
        expect(settings.groupCache[0].name).toBe("Valid Group");
    });

    it('US-203: Import blesses legacy files (Stamps Metadata)', async () => {
        // 1. Create a legacy file (correct structure, missing metadata)
        const fileId = await adapter.createFile(QUOZEN_PREFIX + "Legacy Group", ["Expenses", "Settlements", "Members"]);

        // Add user to members manually to simulate pre-existing access
        await adapter.initializeGroup(fileId, {
            expenses: [],
            settlements: [],
            members: [{ userId: user.id, name: user.name, email: user.email, role: 'owner', joinedAt: '' }]
        });

        // 2. Import it
        const importedGroup = await service.importGroup(fileId, user);

        // 3. Verify it's stamped
        const meta = await adapter.getFileMeta(fileId);
        expect(meta.properties?.['quozen_type']).toBe('group');
        expect(importedGroup.name).toBe("Legacy Group");
    });

    it('US-203: Import fails for invalid files (Wrong Structure)', async () => {
        // 1. Create random spreadsheet (Missing sheets)
        const fileId = await adapter.createFile("Random Sheet", ["Sheet1"]);

        // 2. Attempt Import
        await expect(service.importGroup(fileId, user))
            .rejects.toThrow(/missing required sheets/i);

        // 3. Verify NOT stamped
        const meta = await adapter.getFileMeta(fileId);
        // Properties might be undefined or empty object, but quozen_type must be missing
        expect(meta.properties?.['quozen_type']).toBeUndefined();
    });

    it('US-204: Join Guard prevents joining non-Quozen files', async () => {
        // 1. Create a random file (No metadata)
        const fileId = await adapter.createFile("Random File", ["Sheet1"]);

        // 2. Attempt Join
        await expect(service.joinGroup(fileId, user))
            .rejects.toThrow("This file is not a valid Quozen Group.");
    });

    it('US-204: Join succeeds for valid stamped files', async () => {
        // 1. Create valid group (stamped)
        const group = await service.createGroupSheet("Public Group", user);

        // 2. Simulate another user joining
        const user2: User = { id: 'u2', name: 'Joiner', email: 'joiner@example.com', username: 'joiner' };

        // 3. Join
        const joinedGroup = await service.joinGroup(group.id, user2);
        expect(joinedGroup.id).toBe(group.id);

        // 4. Verify member added
        const data = await adapter.readGroupData(group.id);
        expect(data?.members).toHaveLength(2);
        expect(data?.members.find(m => m.userId === 'u2')).toBeDefined();
    });
});
