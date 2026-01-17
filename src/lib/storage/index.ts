
import { GoogleDriveProvider } from "./google-drive-provider";
import { InMemoryProvider } from "./memory-provider";
import { IStorageProvider } from "./types";

const useMock = import.meta.env.VITE_USE_MOCK_STORAGE === 'true' || import.meta.env.MODE === 'test';

export const storage: IStorageProvider = useMock
    ? new InMemoryProvider()
    : new GoogleDriveProvider();

export * from './types';
