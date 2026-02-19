import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService, InMemoryAdapter, IStorageAdapter, Member, UserSettings } from '@quozen/core';

interface User {
    id: string;
    username: string;
    name: string;
    email: string;
}

describe('Storage Logic & Data Integrity', () => {
    let service: StorageService;
    const ownerUser: User = {
        id: 'owner-google-id',
        username: 'owner',
        name: 'Owner',
        email: 'owner@example.com'
    };

    const invitedEmail = 'invited@example.com';
    const invitedUserGoogleId = 'invited-google-id';

    beforeEach(() => {
        service = new StorageService(new InMemoryAdapter());
    });

    it('Fix Verification: invited user has Email as ID, but leaveGroup handles it via lookup', async () => {
        // 1. Owner creates group and invites user by email
        const group = await service.createGroupSheet("Test Group", ownerUser, [{ email: invitedEmail }]);

        // 2. Verify storage state: The invited member has userId == email
        const data = await service.getGroupData(group.id);
        const invitedMember = data?.members.find((m: Member) => m.email === invitedEmail);

        expect(invitedMember).toBeDefined();
        // In the "Create" phase, ID is still email. 
        expect(invitedMember?.userId).toBe(invitedEmail);

        // 3. Invited user logs in (simulated) and tries to leave using their Google ID
        await expect(service.leaveGroup(group.id, invitedUserGoogleId, invitedEmail))
            .resolves.not.toThrow();
    });

    it('Fix Verification: Role should be "owner" consistently', async () => {
        const group = await service.createGroupSheet("Test Group", ownerUser);
        const data = await service.getGroupData(group.id);
        const owner = data?.members.find((m: Member) => m.userId === ownerUser.id);

        // We now expect "owner", not "admin"
        expect(owner?.role).toBe("owner");
    });
});
