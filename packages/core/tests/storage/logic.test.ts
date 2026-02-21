import { describe, it, expect, beforeEach } from 'vitest';
import { QuozenClient, InMemoryAdapter, Member } from '../../src';

interface User {
    id: string;
    username: string;
    name: string;
    email: string;
}

describe('Storage Logic & Data Integrity', () => {
    let client: QuozenClient;
    const ownerUser: User = {
        id: 'owner-google-id',
        username: 'owner',
        name: 'Owner',
        email: 'owner@example.com'
    };

    const invitedEmail = 'invited@example.com';
    const invitedUserGoogleId = 'invited-google-id';

    beforeEach(() => {
        client = new QuozenClient({ storage: new InMemoryAdapter(), user: ownerUser });
    });

    it('Fix Verification: invited user has Email as ID, but leaveGroup handles it via lookup', async () => {
        // 1. Owner creates group and invites user by email
        const group = await client.groups.create("Test Group", [{ email: invitedEmail }]);

        // 2. Verify storage state: The invited member has userId == email
        const ledger = client.ledger(group.id);
        const members = await ledger.getMembers();
        const invitedMember = members.find((m: Member) => m.email === invitedEmail);

        expect(invitedMember).toBeDefined();
        // In the "Create" phase, ID is still email. 
        expect(invitedMember?.userId).toBe(invitedEmail);

        // 3. Invited user logs in (simulated) and tries to leave using their Google ID
        const invitedClient = new QuozenClient({ storage: (client as any).storage, user: { id: invitedUserGoogleId, email: invitedEmail, name: 'Invited', username: 'invited' } });
        await expect(invitedClient.groups.leaveGroup(group.id)).resolves.not.toThrow();
    });

    it('Fix Verification: Role should be "owner" consistently', async () => {
        const group = await client.groups.create("Test Group");
        const ledger = client.ledger(group.id);
        const members = await ledger.getMembers();
        const owner = members.find((m: Member) => m.userId === ownerUser.id);

        // We now expect "owner", not "admin"
        expect(owner?.role).toBe("owner");
    });
});
