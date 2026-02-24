import { describe, it, expect } from 'vitest';
import { app } from '../src/index';

describe('Groups API', () => {
    let groupId: string;

    it('POST /api/v1/groups should create a group', async () => {
        const payload = { name: 'API Test Group' };
        const res = await app.request('/api/v1/groups', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer mock-test-token', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        expect(res.status).toBe(201);
        const data = await res.json() as any;
        expect(data.name).toBe('API Test Group');
        expect(data.id).toBeDefined();
        groupId = data.id;
    });

    it('GET /api/v1/groups should list groups', async () => {
        const res = await app.request('/api/v1/groups', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer mock-test-token' }
        });
        expect(res.status).toBe(200);
        const data = await res.json() as any;
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/groups/:id/ledger should return analytics', async () => {
        const res = await app.request(`/api/v1/groups/${groupId}/ledger`, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer mock-test-token' }
        });
        expect(res.status).toBe(200);
        const data = await res.json() as any;
        expect(data.totalVolume).toBe(0);
    });

    it('PATCH /api/v1/groups/:id should update a group', async () => {
        const res = await app.request(`/api/v1/groups/${groupId}`, {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer mock-test-token', 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Updated Group Name' })
        });
        expect(res.status).toBe(200);
        const data = await res.json() as any;
        expect(data.success).toBe(true);
    });

    it('POST /api/v1/groups/:id/join should join a group', async () => {
        const res = await app.request(`/api/v1/groups/${groupId}/join`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer mock-test-token' }
        });
        expect(res.status).toBe(200);
    });

    it('DELETE /api/v1/groups/:id should delete a group', async () => {
        const res = await app.request(`/api/v1/groups/${groupId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer mock-test-token' }
        });
        expect(res.status).toBe(204);
    });
});
