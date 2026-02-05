import { test, expect, Page, chromium } from '@playwright/test';
import { isMockMode } from './utils';

const SETTINGS_FILE_NAME = "quozen-settings.json";
const QUOZEN_PREFIX = "Quozen - ";
const DRIVE_API_URL = "https://www.googleapis.com/drive/v3";

async function getAccessToken(page: Page): Promise<string> {
    const token = await page.evaluate(() => localStorage.getItem("quozen_access_token"));
    if (!token) throw new Error("No access token found in localStorage");
    return token;
}

// --- API Helpers ---

async function fetchWithAuth(url: string, token: string, options: RequestInit = {}) {
    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`API Error ${response.status}: ${body}`);
    }
    return response;
}

async function findFiles(token: string, search: string) {
    const q = `${search} and trashed = false`;
    const url = `${DRIVE_API_URL}/files?q=${encodeURIComponent(q)}&fields=files(id, name)`;
    const res = await fetchWithAuth(url, token);
    const data = await res.json();
    return data.files || [];
}

async function deleteFile(token: string, fileId: string) {
    try {
        await fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}`, token, { method: "DELETE" });
    } catch (e: any) {
        if (!e.message.includes('404')) throw e;
    }
}

async function createEmptySettingsFile(token: string) {
    const metadata = {
        name: SETTINGS_FILE_NAME,
        mimeType: "application/json"
    };
    // Create file with empty content
    const res = await fetchWithAuth(`${DRIVE_API_URL}/files`, token, {
        method: "POST",
        body: JSON.stringify(metadata)
    });
    const file = await res.json();
    return file.id;
}

async function createDummyGroup(token: string, name: string) {
    // Simplified creation of a Sheet with the prefix
    const metadata = {
        name: `${QUOZEN_PREFIX}${name}`,
        mimeType: "application/vnd.google-apps.spreadsheet"
    };
    const res = await fetchWithAuth(`${DRIVE_API_URL}/files`, token, {
        method: "POST",
        body: JSON.stringify(metadata)
    });
    return await res.json();
}

// --- Tests ---

test.describe.serial('Google Drive Persistence Reproduction', () => {
    test.setTimeout(300000); // 5 minutes suite timeout
    let accessToken: string;
    let userProfile: string;

    test.beforeAll(async ({ browser }) => {
        if (isMockMode) {
            test.skip(true, 'Skipping Google Drive tests in Mock mode');
            return;
        }

        console.log("Real Mode: Launching browser for manual login...");
        const page = await browser.newPage();

        console.log("Navigating to root...");
        await page.goto('/');

        console.log("Waiting for user to log in manually (timeout: 5 minutes)...");
        // Wait for dashboard to indicate login success
        await expect(page.getByRole('button', { name: /New Group/i })).toBeVisible({ timeout: 300_000 });

        accessToken = await getAccessToken(page);
        userProfile = await page.evaluate(() => localStorage.getItem("quozen_user_profile") || "");
        if (!userProfile) console.warn("User profile not found in localStorage!");
        console.log("Access Token and Profile acquired.");

        await page.close();
    });

    test.beforeEach(async () => {
        // Clean up settings file
        const files = await findFiles(accessToken, `name = '${SETTINGS_FILE_NAME}'`);
        for (const file of files) {
            console.log(`Deleting existing settings file: ${file.id}`);
            await deleteFile(accessToken, file.id);
        }
    });

    test('Reproduction: Concurrent initialization should not create duplicate settings files', async ({ browser }) => {
        // Scenario: Two tabs open simultaneously when no settings file exists
        const context1 = await browser.newContext();
        const context2 = await browser.newContext();

        // Inject token to skip login in these new contexts
        await context1.addInitScript(({ token, profile }) => {
            localStorage.setItem("quozen_access_token", token);
            if (profile) localStorage.setItem("quozen_user_profile", profile);
        }, { token: accessToken, profile: userProfile });

        await context2.addInitScript(({ token, profile }) => {
            localStorage.setItem("quozen_access_token", token);
            if (profile) localStorage.setItem("quozen_user_profile", profile);
        }, { token: accessToken, profile: userProfile });

        const page1 = await context1.newPage();
        const page2 = await context2.newPage();

        // Listen for all console messages
        page1.on('console', msg => console.log(`Page1: [${msg.type()}] ${msg.text()}`));
        page2.on('console', msg => console.log(`Page2: [${msg.type()}] ${msg.text()}`));

        // Load both roughly at the same time
        const p1 = page1.goto('/');
        const p2 = page2.goto('/');
        await Promise.all([p1, p2]);

        // Wait for stabilization (assuming they try to init)
        await page1.waitForTimeout(15000);

        // Check Drive for duplicates
        const files = await findFiles(accessToken, `name = '${SETTINGS_FILE_NAME}'`);
        console.log(`Found ${files.length} settings files.`);

        // Fails if > 1
        expect(files.length, 'Should have exactly one settings file').toBe(1);

        // Also check if content is valid JSON (not empty)
        const fileId = files[0].id;
        const res = await fetchWithAuth(`${DRIVE_API_URL}/files/${fileId}?alt=media`, accessToken);
        const text = await res.text();
        console.log("Settings file content:", text);

        expect(text.length, 'Settings file should not be empty').toBeGreaterThan(0);
        expect(() => JSON.parse(text)).not.toThrow();

        await context1.close();
        await context2.close();
    });

    test('Reproduction: App should handle empty settings file gracefully', async ({ browser }) => {
        // Scenario: File exists but is empty (0 bytes)
        await createEmptySettingsFile(accessToken);

        const context = await browser.newContext();
        await context.addInitScript(({ token, profile }) => {
            localStorage.setItem("quozen_access_token", token);
            if (profile) localStorage.setItem("quozen_user_profile", profile);
        }, { token: accessToken, profile: userProfile });

        const page = await context.newPage();
        await page.goto('/');

        // Expectation: App should probably detect it's invalid/empty and re-initialize it?
        // OR at least not crash/hang.

        // If the bug is that it stays empty, we assert that it was fixed (re-written)
        // For reproduction, we might expect it to stay empty or app to error.

        await page.waitForTimeout(5000);

        const files = await findFiles(accessToken, `name = '${SETTINGS_FILE_NAME}'`);
        const res = await fetchWithAuth(`${DRIVE_API_URL}/files/${files[0].id}?alt=media`, accessToken);
        const text = await res.text();

        // The expectation for a working app: it should have repaired the file.
        // If this test fails, it mimics the user report (file creates empty/stays empty).
        expect(text.length, 'App should have repaired the empty file').toBeGreaterThan(2);
        expect(() => JSON.parse(text)).not.toThrow();

        await context.close();
    });

    test('Reproduction: Reconciliation should find existing groups', async ({ browser }) => {
        // Setup: No settings file (handled by beforeEach), but some group files exist.
        const groupName = `ReproGroup_${Date.now()}`;
        const groupFile = await createDummyGroup(accessToken, groupName);
        console.log(`Created dummy group: ${groupFile.name} (${groupFile.id})`);

        try {
            const context = await browser.newContext();
            await context.addInitScript((token) => {
                localStorage.setItem("quozen_access_token", token);
            }, accessToken);

            const page = await context.newPage();
            // Go to Profile to trigger scan manually (or usually it scans on first load if missing settings)
            // US-101 says: "If settings missing, call reconcileGroups"

            await page.goto('/');

            // Should see the group in the list (redirected to groups maybe?)
            // Or if we need to manually reconcile:
            // await page.goto('/profile');
            // await page.click('text=Scan for missing groups');

            // Wait for UI to update
            await expect(page.getByText(groupName)).toBeVisible({ timeout: 10000 });

        } finally {
            // Cleanup group
            await deleteFile(accessToken, groupFile.id);
        }
    });

});
