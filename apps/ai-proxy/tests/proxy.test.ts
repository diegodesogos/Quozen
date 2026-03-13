import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import app from '../src/index';

// Polyfill crypto for Node environment
if (!globalThis.crypto) {
    globalThis.crypto = webcrypto as any;
}

// Mock AI SDK
vi.mock('ai', () => ({
    generateText: vi.fn().mockResolvedValue({
        text: 'Hello, I am AI',
        toolCalls: []
    })
}));

vi.mock('@ai-sdk/google', () => ({
    createGoogleGenerativeAI: vi.fn(() => vi.fn())
}));

describe('AI Proxy API', () => {
    beforeEach(() => {
        vi.stubEnv('KMS_SECRET', '0123456789abcdef0123456789abcdef');
        vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-api-key');
    });

    const ENV = {
        KMS_SECRET: '0123456789abcdef0123456789abcdef',
        GOOGLE_GENERATIVE_AI_API_KEY: 'test-api-key'
    };

    it('GET / should return status', async () => {
        const res = await app.request('/', {
            headers: { 'Authorization': 'Bearer mock-test-token' }
        }, ENV);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('Quozen AI Proxy is Running');
    });

    it('POST /api/v1/agent/encrypt should encrypt API key', async () => {
        const res = await app.request('/api/v1/agent/encrypt', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer mock-test-token',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ apiKey: 'sk-test-key' })
        }, ENV);

        if (res.status === 500) {
            console.error(await res.json());
        }
        expect(res.status).toBe(200);
        const data = await res.json() as any;
        expect(data.ciphertext).toBeDefined();
    });

    it('POST /api/v1/agent/chat should return AI response', async () => {
        const res = await app.request('/api/v1/agent/chat', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer mock-test-token',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'hello' }],
                systemPrompt: 'You are a help assistant',
                tools: []
            })
        }, ENV);

        expect(res.status).toBe(200);
        const data = await res.json() as any;
        expect(data.type).toBe('text');
        expect(data.content).toBe('Hello, I am AI');
    });

    it('POST /api/v1/agent/chat with ciphertext should decrypt and use key', async () => {
        // First encrypt
        const encRes = await app.request('/api/v1/agent/encrypt', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer mock-test-token', 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: 'personal-key' })
        }, ENV);
        const { ciphertext } = await encRes.json() as any;

        // Then chat
        const res = await app.request('/api/v1/agent/chat', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer mock-test-token',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'hello' }],
                systemPrompt: 'You are a help assistant',
                tools: [],
                ciphertext
            })
        }, ENV);

        expect(res.status).toBe(200);
    });

    it('POST /api/v1/agent/encrypt should return 401 with invalid token', async () => {
        const res = await app.request('/api/v1/agent/encrypt', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer invalid-token',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ apiKey: 'sk-test' })
        }, ENV);

        expect(res.status).toBe(401);
    });
});
