import { vi } from 'vitest';
import { InMemoryAdapter, StorageService } from '../src';

// Mock global fetch if needed (for google drive adapter tests in isolation later)
global.fetch = vi.fn();

/**
 * Helper to create a storage service with an in-memory adapter for testing.
 */
export const createTestStorageService = () => {
    return new StorageService(new InMemoryAdapter());
};

/**
 * Mock Auth Provider that returns a dummy token.
 */
export const mockAuthProvider = {
    getToken: () => 'mock-token',
};
