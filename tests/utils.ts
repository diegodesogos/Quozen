
import { Page, BrowserContext, APIRequestContext, expect } from '@playwright/test';
import { mockServer } from './mock-server';

export const isMockMode = process.env.VITE_USE_MOCK_STORAGE === 'true';

const SETTINGS_FILE_NAME = "quozen-settings.json";
const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const MOCK_API_BASE = "/_test/storage";

/**
 * Sets up authentication based on the current mode.
 */
export async function setupAuth(page: Page) {
    if (isMockMode) {
        await page.addInitScript(() => {
            localStorage.setItem("quozen_access_token", "mock-token-123");
            localStorage.setItem("quozen_user_profile", JSON.stringify({
                id: "test-user-id",
                username: "test@example.com",
                email: "test@example.com",
                name: "Test User",
                picture: "https://via.placeholder.com/150"
            }));
        });
    }
}

/**
 * Initializes the test environment.
 * In Mock Mode: Intercepts network requests to the mock storage API.
 */
export async function setupTestEnvironment(context: BrowserContext) {
    if (isMockMode) {
        await context.route(`${MOCK_API_BASE}/**`, async (route) => {
            await mockServer.handle(route);
        });
    }
}

/**
 * Resets the mock server state.
 */
export async function resetTestState() {
    if (isMockMode) {
        mockServer.reset();
    }
}

/**
 * Waits for the user to be logged in (Real Mode only).
 * Call this after navigating to the app.
 */
export async function ensureLoggedIn(page: Page) {
    if (!isMockMode) {
        console.log("Real Mode: Waiting for user to log in manually (timeout: 5 minutes)...");
        // Wait for a sign that we are logged in, e.g., the 'New Group' button on dashboard
        await expect(page.getByRole('button', { name: 'New Group' })).toBeVisible({ timeout: 300_000 });
        console.log("Real Mode: User logged in.");
    }
}

/**
 * Gets the access token. 
 * In Mock Mode, returns a static token.
 * In Real Mode, scrapes it from the page (requires manual login).
 */
export async function getAccessToken(page: Page): Promise<string> {
    if (isMockMode) return "mock-token-123";

    // In Real Mode, we wait for it to appear
    const token = await page.evaluate(() => localStorage.getItem("quozen_access_token"));
    if (!token) throw new Error("No access token found in localStorage");
    return token;
}

// --- Unified API Helpers ---

/**
 * Helper to make requests to either Google Drive or Mock API.
 */
async function apiRequest(request: APIRequestContext, method: string, url: string, token: string, body?: any) {
    if (isMockMode) {
        // Direct dispatch to mock server in the same process
        const res = await mockServer.dispatch(method, url, body);

        return {
            ok: () => res.status >= 200 && res.status < 300,
            status: () => res.status,
            json: async () => res.body,
            text: async () => JSON.stringify(res.body)
        };
    }

    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    // If URL starts with /, append to baseURL (Mock). Otherwise absolute (Google).
    const response = await request.fetch(url, {
        method,
        headers,
        data: body
    });

    if (!response.ok()) {
        const text = await response.text();
        // Ignore 404 for delete
        if (method === 'DELETE' && response.status() === 404) return response;
        throw new Error(`API Error ${response.status()}: ${text}`);
    }
    return response;
}

export async function findFiles(request: APIRequestContext, token: string, search: string) {
    let url: string;
    if (isMockMode) {
        // Mock API uses q param
        url = `${MOCK_API_BASE}/files?q=${encodeURIComponent(search)}`;
    } else {
        const q = `${search} and trashed = false`;
        url = `${DRIVE_API_URL}/files?q=${encodeURIComponent(q)}&fields=files(id, name)`;
    }

    const res = await apiRequest(request, 'GET', url, token);
    const data = await res.json();
    return data.files || [];
}

export async function deleteFile(request: APIRequestContext, token: string, fileId: string) {
    const url = isMockMode
        ? `${MOCK_API_BASE}/files/${fileId}`
        : `${DRIVE_API_URL}/files/${fileId}`;

    await apiRequest(request, 'DELETE', url, token);
}

export async function createEmptySettingsFile(request: APIRequestContext, token: string) {
    if (isMockMode) {
        const res = await apiRequest(request, 'POST', `${MOCK_API_BASE}/files`, token, {
            name: SETTINGS_FILE_NAME,
            sheetNames: [] // Settings is just a JSON file in drive, but our Mock treats everything as "Files". 
            // Wait, RemoteMockAdapter implementation of saveSettings uses /settings endpoint or /files?
        });
        // Wait, createEmptySettingsFile in reproduce_issues.spec.ts creates a file with mimeType application/json.
        // My Mock Adapter "createFile" creates a "Sheet" mock.
        // But saveSettings in RemoteMockAdapter uses /settings endpoint.

        // If the APP uses saveSettings, it hits /settings.
        // But this test setup helper creates a file manually to test "Concurrent Initialization".
        // The app initialization likely checks if file exists.

        // Logic:
        // App `loadSettings` calls `listFiles` (GET /files).
        // If found, it reads it.
        // If not found, it creates it.

        // So for the test "App should handle empty settings file", we need to create a file that `listFiles` finds.
        // Mock Adapter `listFiles` returns items from `this.sheets`.
        // So we must create a "Sheet" (File) in the mock adapter that matches the name.

        const data = await res.json();
        return data.id;
    } else {
        const metadata = {
            name: SETTINGS_FILE_NAME,
            mimeType: "application/json"
        };
        const res = await apiRequest(request, 'POST', `${DRIVE_API_URL}/files`, token, metadata);
        const data = await res.json();
        return data.id;
    }
}

export async function createDummyGroup(request: APIRequestContext, token: string, name: string) {
    // Ensure consistency: Real mode prepends "Quozen - ", Mock mode should too.
    const fullName = name.startsWith("Quozen - ") ? name : `Quozen - ${name}`;

    if (isMockMode) {
        const res = await apiRequest(request, 'POST', `${MOCK_API_BASE}/files`, token, {
            name: fullName,
            sheetNames: ["Expenses", "Settlements", "Members"]
        });
        const data = await res.json();
        const id = data.id;
        // Fetch it back to return full object
        return { id, name: fullName };
    } else {
        const metadata = {
            name: fullName,
            mimeType: "application/vnd.google-apps.spreadsheet"
        };
        const res = await apiRequest(request, 'POST', `${DRIVE_API_URL}/files`, token, metadata);
        return await res.json();
    }
}

export async function fetchFileContent(request: APIRequestContext, token: string, fileId: string) {
    if (isMockMode) {
        // For settings (JSON), our mock stores it in `userSettings` map via `/settings` endpoint usually.
        // BUT if it was created via `FILES` API (as above), it is a MockSheet.
        // The App's `GoogleDriveAdapter` reads settings via `alt=media`.
        // My `RemoteMockAdapter` reads settings via `/settings`.

        // This causes a discrepancy.
        // Real App: Settings File is a FILE in Drive. content is JSON.
        // Mock App: Settings is a specific endpoint `/settings`.
        // OR `listFiles` finds a file, then `loadSettings` reads it.

        // In `GoogleDriveAdapter.loadSettings`:
        // 1. `listFiles` with `name = settings`.
        // 2. `fetch(fileId + '?alt=media')`.

        // In `RemoteMockAdapter.loadSettings`:
        // 1. `fetch('/settings')`.

        // This is a VALID discrepancy. The Mock Adapter simplifies "Settings" concept.
        // BUT, the test "Concurrent initialization" relies on `files` list.
        // It checks if 2 files were created.

        // In RemoteMockAdapter `saveSettings`:
        // It calls `POST /settings`.

        // If `POST /settings` in `mock-server.ts` does NOT create a "File" in `adapter.sheets`, then `listFiles` will return 0 results!
        // `GoogleDriveAdapter` `saveSettings` creates a FILE.
        // So `RemoteMockAdapter` `saveSettings` and `mock-server` `POST /settings` handlers MUST create a FILE in `adapter.sheets` if they want `reproduce_issues` test to work (checking for duplicates).

        // Does `InMemoryAdapter.saveSettings` create a File?
        // Let's check `memory-adapter.ts`.
        // `saveSettings` -> `this.userSettings.set(email, settings)`.
        // `listFiles` -> Iterates `this.sheets`.
        // `sheets` vs `userSettings` are arrays.

        // So `InMemoryAdapter` currently separates Settings from Files.
        // `GoogleDriveAdapter` treats Settings AS a File.

        // THIS IS THE CAUSE OF INCONSISTENCY!
        // To fix this, `InMemoryAdapter` should store Settings as a "File" in `this.sheets` (or `MockSheet` concept).
        // OR `InMemoryAdapter.listFiles` should ALSO return the settings file if it exists.

        // I should fix `InMemoryAdapter` to include the settings file in `listFiles` so that reconciliation logic (which might look for settings?) works?
        // Actually, the test checks `findFiles` for settings.
        // If `InMemoryAdapter` doesn't expose settings in `listFiles`, the test fails.

        // I will modify `InMemoryAdapter.saveSettings` to ALSO save it as a "Sheet" (File) with the name `quozen-settings.json`.
        // And `loadSettings` should look there.
        // This unifies the behavior.

        // I will handle this in `mock-server.ts` or `InMemoryAdapter`. 
        // Better in `InMemoryAdapter` update.

        const res = await apiRequest(request, 'GET', `${MOCK_API_BASE}/settings?email=test@example.com`, token);
        const json = await res.json();
        return JSON.stringify(json.settings);
    } else {
        const res = await apiRequest(request, 'GET', `${DRIVE_API_URL}/files/${fileId}?alt=media`, token);
        return await res.text();
    }
}
