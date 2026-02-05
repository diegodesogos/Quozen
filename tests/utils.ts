import { Page, expect } from '@playwright/test';

export const isMockMode = process.env.VITE_USE_MOCK_STORAGE === 'true';

/**
 * Sets up authentication based on the current mode.
 * - In Mock Mode: Injects a mock token via setup script (must be called before navigation).
 * - In Real Mode: Does nothing (assumes manual login flow).
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
