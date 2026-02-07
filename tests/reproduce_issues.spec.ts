
import { test, expect, chromium } from '@playwright/test';
import {
    isMockMode,
    setupAuth,
    setupTestEnvironment,
    getAccessToken,
    findFiles,
    deleteFile,
    createEmptySettingsFile,
    createDummyGroup,
    fetchFileContent,
    resetTestState
} from './utils';

const SETTINGS_FILE_NAME = "quozen-settings.json";

test.describe.serial('Google Drive Persistence Reproduction', () => {
    test.setTimeout(300000); // 5 minutes suite timeout
    let accessToken: string;
    let userProfile: string;

    test.beforeAll(async ({ browser }) => {
        // Prepare a page to get token
        const context = await browser.newContext();
        await setupTestEnvironment(context);
        const page = await context.newPage();

        await setupAuth(page); // Injects mock token if mock mode

        if (!isMockMode) {
            console.log("Real Mode: Launching browser for manual login...");
            await page.goto('/');
            console.log("Waiting for user to log in manually (timeout: 5 minutes)...");
            await expect(page.getByRole('button', { name: /New Group/i })).toBeVisible({ timeout: 300_000 });
        } else {
            // Need to visit page to init localStorage
            await page.goto('/');
        }

        accessToken = await getAccessToken(page);
        userProfile = await page.evaluate(() => localStorage.getItem("quozen_user_profile") || "");

        if (!userProfile) console.warn("User profile not found in localStorage!");
        console.log("Access Token and Profile acquired.");

        await context.close();
    });

    test.beforeEach(async ({ context }) => {
        await setupTestEnvironment(context); // Setup routes for default context (if used)

        if (isMockMode) {
            await resetTestState();
        } else {
            // Clean up settings file using a temporary context/request
            // We can use the test context request if setupTestEnvironment passes routes.
            // But helpers take valid request.

            const request = context.request;

            const files = await findFiles(request, accessToken, `name = '${SETTINGS_FILE_NAME}'`);
            for (const file of files) {
                console.log(`Deleting existing settings file: ${file.id}`);
                await deleteFile(request, accessToken, file.id);
            }
        }
    });

    test('Reproduction: Concurrent initialization should not create duplicate settings files', async ({ browser }) => {
        // Scenario: Two tabs open simultaneously when no settings file exists
        const context1 = await browser.newContext();
        await setupTestEnvironment(context1);

        const context2 = await browser.newContext();
        await setupTestEnvironment(context2);

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

        // Wait for stabilization
        await page1.waitForTimeout(15000);

        // Check Drive for duplicates
        // Use context1.request to check (it has routes hooked if mock)
        const files = await findFiles(context1.request, accessToken, `name = '${SETTINGS_FILE_NAME}'`);
        console.log(`Found ${files.length} settings files.`);

        // Fails if > 1
        expect(files.length, 'Should have exactly one settings file').toBe(1);

        // Also check if content is valid JSON (not empty)
        const fileId = files[0].id;
        const text = await fetchFileContent(context1.request, accessToken, fileId);
        console.log("Settings file content:", text);

        expect(text.length, 'Settings file should not be empty').toBeGreaterThan(0);
        expect(() => JSON.parse(text)).not.toThrow();

        await context1.close();
        await context2.close();
    });

    test('Reproduction: App should handle empty settings file gracefully', async ({ browser }) => {
        const context = await browser.newContext();
        await setupTestEnvironment(context); // Hook routes

        // Ensure empty settings file exists
        await createEmptySettingsFile(context.request, accessToken);

        await context.addInitScript(({ token, profile }) => {
            localStorage.setItem("quozen_access_token", token);
            if (profile) localStorage.setItem("quozen_user_profile", profile);
        }, { token: accessToken, profile: userProfile });

        const page = await context.newPage();
        await page.goto('/');

        await page.waitForTimeout(5000);

        const files = await findFiles(context.request, accessToken, `name = '${SETTINGS_FILE_NAME}'`);
        expect(files.length).toBeGreaterThan(0);

        const text = await fetchFileContent(context.request, accessToken, files[0].id);

        // The expectation for a working app: it should have repaired the file.
        // If this test fails, it mimics the user report (file creates empty/stays empty).
        expect(text.length, 'App should have repaired the empty file').toBeGreaterThan(2);
        expect(() => JSON.parse(text)).not.toThrow();

        await context.close();
    });

    test('Reproduction: Reconciliation should find existing groups', async ({ browser }) => {
        const context = await browser.newContext();
        await setupTestEnvironment(context);

        // Setup: No settings file (handled by beforeEach), but some group files exist.
        const groupName = `ReproGroup_${Date.now()}`;
        const groupFile = await createDummyGroup(context.request, accessToken, groupName);
        console.log(`Created dummy group: ${groupFile.name} (${groupFile.id})`);

        try {
            await context.addInitScript(({ token, profile }) => {
                localStorage.setItem("quozen_access_token", token);
                if (profile) localStorage.setItem("quozen_user_profile", profile);
            }, { token: accessToken, profile: userProfile });

            const page = await context.newPage();
            // Go to Profile to trigger scan manually (or usually it scans on first load if missing settings)

            await page.goto('/');

            // Wait for UI to update
            await expect(page.getByText(groupName)).toBeVisible({ timeout: 10000 });

        } finally {
            // Cleanup group
            await deleteFile(context.request, accessToken, groupFile.id);
            await context.close();
        }
    });

});
