import { test, expect } from '@playwright/test';
import { setupAuth, ensureLoggedIn, isMockMode, resetTestState, setupTestEnvironment } from './utils';

test.describe('Functional Flow', () => {
    // Inject auth token if in Mock mode and setup request interception
    test.beforeEach(async ({ page }) => {
        await resetTestState(); // Ensure clean state for every test
        await setupTestEnvironment(page.context()); // <--- CRITICAL: Intercept /_test/storage requests
        await setupAuth(page);
    });

    test('should allow creating a group and adding an expense', async ({ page }) => {
        // 1. Go to root (redirects to dashboard)
        await page.goto('/');
        await ensureLoggedIn(page);

        // 2. Verify we are redirected to Groups page (because no groups exist)
        await expect(page).toHaveURL(/.*groups/);
        if (isMockMode) {
            // matches "No groups yet."
            await expect(page.getByText('No groups yet')).toBeVisible();
        }

        // 3. Create a Group
        await page.getByRole('button', { name: 'New Group' }).click();

        // Modal appears - Title changed to "Create Group" in i18n
        // We use getByRole('heading') to avoid ambiguity with the "Create Group" submit button
        await expect(page.getByRole('heading', { name: 'Create Group' })).toBeVisible();

        await page.getByLabel('Group Name').fill('Holiday Trip');
        await page.getByRole('button', { name: 'Create Group' }).click();

        // Wait for modal to close (implies success)
        await expect(page.getByRole('heading', { name: 'Create Group' })).not.toBeVisible();

        // 4. Verify Group Switch
        // Note: In functional tests, we rely on the UI updates. The header should update.
        await expect(page.getByTestId('header').getByText('Holiday Trip')).toBeVisible();

        // 5. Add Expense
        await page.getByTestId('button-nav-add').click();
        await expect(page).toHaveURL(/.*add-expense/);

        await page.getByTestId('input-expense-description').fill('Dinner');
        await page.getByTestId('input-expense-amount').fill('50');
        await page.getByTestId('select-category').click();
        await page.getByRole('option', { name: 'Food & Dining' }).click();
        await page.getByTestId('button-submit-expense').click();

        // 6. Verify in List (Dashboard)
        await expect(page.getByText('Dinner')).toBeVisible();
        await expect(page.getByText('$50.00').first()).toBeVisible();
    });

    test('should edit an existing group name and members', async ({ page }) => {
        await page.goto('/groups');
        await ensureLoggedIn(page);

        // Create initial group
        await page.getByRole('button', { name: 'New Group' }).click();
        await page.getByLabel('Group Name').fill('Original Name');
        await page.getByRole('button', { name: 'Create Group' }).click();
        await expect(page.getByRole('heading', { name: 'Original Name', level: 3 })).toBeVisible();

        // Click Edit
        await page.locator('.rounded-lg', { hasText: 'Original Name' })
            .getByRole('button', { name: 'Edit' })
            .click();

        await expect(page.getByRole('heading', { name: 'Edit Group' })).toBeVisible();
        await page.getByLabel('Group Name').fill('Renamed Group');
        await page.getByLabel('Members (Optional)').fill('newuser@example.com');
        await page.getByRole('button', { name: 'Update Group' }).click();

        await expect(page.getByRole('heading', { name: 'Edit Group' })).not.toBeVisible();
        await expect(page.getByRole('heading', { name: 'Renamed Group', level: 3 })).toBeVisible();
    });

    test('should allow deleting a group', async ({ page }) => {
        await page.goto('/groups');
        await ensureLoggedIn(page);

        // 1. Create a group to delete
        await page.getByRole('button', { name: 'New Group' }).click();
        await page.getByLabel('Group Name').fill('Group To Delete');
        await page.getByRole('button', { name: 'Create Group' }).click();

        // Verify it exists
        const groupCard = page.locator('.rounded-lg', { hasText: 'Group To Delete' });
        await expect(groupCard).toBeVisible();

        // 2. Find and click Delete (trash icon)
        const deleteBtn = groupCard.locator('button svg.lucide-trash2').locator('..');
        await deleteBtn.click();

        // 3. Confirm Dialog
        await expect(page.getByText('Delete Group')).toBeVisible();
        // Updated text expectation to match i18n key: "Are you sure you want to delete \"{{name}}\"?"
        await expect(page.getByText('Are you sure you want to delete "Group To Delete"?')).toBeVisible();

        await page.getByRole('button', { name: 'Delete' }).click();

        // 4. Verify it's gone
        await expect(page.getByText('Delete Group')).not.toBeVisible();
        await expect(groupCard).not.toBeVisible();
    });
});
