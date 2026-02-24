import { describe, it, expect, beforeAll } from 'vitest';
import { app } from '../src/index';

describe('Transactions API', () => {
    let groupId: string;
    let expenseId: string;
    let settleId: string;

    beforeAll(async () => {
        const res = await app.request('/api/v1/groups', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer mock-test-token', 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Transactions Test Group' })
        });
        const data = await res.json() as any;
        groupId = data.id;
    });

    it('POST /api/v1/groups/:id/expenses should create an expense', async () => {
        const payload = {
            description: 'Dinner',
            amount: 50,
            category: 'Food',
            date: new Date().toISOString(),
            paidByUserId: 'u1',
            splits: [{ userId: 'u1', amount: 25 }, { userId: 'u2', amount: 25 }]
        };
        const res = await app.request(`/api/v1/groups/${groupId}/expenses`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer mock-test-token', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        expect(res.status).toBe(201);
        const data = await res.json() as any;
        expect(data.description).toBe('Dinner');
        expenseId = data.id;
    });

    it('PATCH /api/v1/groups/:id/expenses/:expId should update an expense', async () => {
        const payload = { description: 'Lunch' };
        const res = await app.request(`/api/v1/groups/${groupId}/expenses/${expenseId}`, {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer mock-test-token', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        expect(res.status).toBe(200);
    });

    it('POST /api/v1/groups/:id/expenses should return 400 for invalid data', async () => {
        const invalidPayload = { description: 'Missing Amount', category: 'Food' };
        const res = await app.request(`/api/v1/groups/${groupId}/expenses`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer mock-test-token', 'Content-Type': 'application/json' },
            body: JSON.stringify(invalidPayload)
        });
        expect(res.status).toBe(400);
    });

    it('GET /api/v1/groups/:id/expenses should return expenses', async () => {
        const res = await app.request(`/api/v1/groups/${groupId}/expenses`, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer mock-test-token' }
        });
        expect(res.status).toBe(200);
        const data = await res.json() as any[];
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
    });

    it('DELETE /api/v1/groups/:id/expenses/:expId should delete the expense', async () => {
        const res = await app.request(`/api/v1/groups/${groupId}/expenses/${expenseId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer mock-test-token' }
        });
        expect(res.status).toBe(204);
    });

    // --- Settlements ---

    it('POST /api/v1/groups/:id/settlements should create a settlement', async () => {
        const payload = { fromUserId: 'u1', toUserId: 'u2', amount: 15, method: 'venmo' };
        const res = await app.request(`/api/v1/groups/${groupId}/settlements`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer mock-test-token', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        expect(res.status).toBe(201);
        const data = await res.json() as any;
        expect(data.amount).toBe(15);
        settleId = data.id;
    });

    it('GET /api/v1/groups/:id/settlements should list settlements', async () => {
        const res = await app.request(`/api/v1/groups/${groupId}/settlements`, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer mock-test-token' }
        });
        expect(res.status).toBe(200);
        const data = await res.json() as any[];
        expect(data.length).toBeGreaterThan(0);
    });

    it('PATCH /api/v1/groups/:id/settlements/:settleId should update a settlement', async () => {
        const payload = { amount: 20 };
        const res = await app.request(`/api/v1/groups/${groupId}/settlements/${settleId}`, {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer mock-test-token', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        expect(res.status).toBe(200);
    });

    it('DELETE /api/v1/groups/:id/settlements/:settleId should delete a settlement', async () => {
        const res = await app.request(`/api/v1/groups/${groupId}/settlements/${settleId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer mock-test-token' }
        });
        expect(res.status).toBe(204);
    });
});
