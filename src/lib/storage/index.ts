
import {
    StorageService,
    GoogleDriveAdapter,
    InMemoryAdapter,
    RemoteMockAdapter
} from "@quozen/core";
import { getAuthToken } from "../tokenStore";

const useMock = import.meta.env.VITE_USE_MOCK_STORAGE === 'true' || import.meta.env.MODE === 'test';
const useRemoteMock = import.meta.env.VITE_E2E_MOCK === 'true';

const adapter = useMock
    ? (useRemoteMock ? new RemoteMockAdapter(getAuthToken) : new InMemoryAdapter())
    : new GoogleDriveAdapter(getAuthToken);

export const storage = new StorageService(adapter);

export { StorageService, InMemoryAdapter }; 
