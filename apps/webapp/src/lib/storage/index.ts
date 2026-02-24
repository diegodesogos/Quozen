import {
    QuozenClient,
    GoogleDriveStorageLayer,
    InMemoryAdapter,
    RemoteMockAdapter
} from "@quozen/core";
import { getAuthToken } from "../tokenStore";

export const getQuozen = (): QuozenClient => {
    const token = getAuthToken();
    const userStr = localStorage.getItem("quozen_user_profile");
    const user = userStr ? JSON.parse(userStr) : { id: "", username: "", email: "", name: "" };

    const useMock = import.meta.env.VITE_USE_MOCK_STORAGE === 'true' || import.meta.env.MODE === 'test';
    const useRemoteMock = import.meta.env.VITE_E2E_MOCK === 'true';

    const adapter = useMock
        ? (useRemoteMock ? new RemoteMockAdapter(getAuthToken) : new InMemoryAdapter())
        : new GoogleDriveStorageLayer(getAuthToken);

    return new QuozenClient({ storage: adapter, user, enableCache: true, cacheTtlMs: 30000 });
};

export const quozen = new Proxy({} as QuozenClient, { get(target, prop) { return (getQuozen() as any)[prop]; } });
export { InMemoryAdapter };
