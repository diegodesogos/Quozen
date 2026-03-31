import { vi } from 'vitest';
import { InMemoryAdapter, QuozenClient } from '../src';

// Mock global fetch if needed (for google drive adapter tests in isolation later)
global.fetch = vi.fn();

/**
 * Helper to create a QuozenClient with an in-memory adapter for testing.
 */
export const createTestClient = () => {
    const mockUser = {
        id: 'test-u1',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User'
    };

    return new QuozenClient({
        storage: new InMemoryAdapter(),
        user: mockUser
    });
};

/**
 * Mock Auth Provider that returns a dummy token.
 */
export const mockAuthProvider = {
    getToken: () => 'mock-token',
};
