
import { StorageService } from "./storage-service";
import { GoogleDriveAdapter } from "./google-drive-adapter";
import { InMemoryAdapter } from "./memory-adapter";
import { IStorageProvider } from "./types";

const useMock = import.meta.env.VITE_USE_MOCK_STORAGE === 'true' || import.meta.env.MODE === 'test';

const adapter = useMock
    ? new InMemoryAdapter()
    : new GoogleDriveAdapter();

export const storage: IStorageProvider = new StorageService(adapter);

export * from './types';
export { StorageService }; // Optional export for testing
export { InMemoryAdapter }; // Optional export for testing
