import { test, expect } from '@playwright/test';

test.describe('Functional Flow with Mock Storage', () => {
    // Inject auth token and user profile to bypass Google Login
    test.beforeEach(async ({ page }) => {
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
    });

    test('should allow creating a group and adding an expense', async ({ page }) => {
        // 1. Go to root (redirects to dashboard)
        await page.goto('/');

        // 2. Verify Dashboard loaded
        // 2. Verify we are redirected to Groups page (because no groups exist)
        await expect(page).toHaveURL(/.*groups/);
        await expect(page.getByText('No groups yet')).toBeVisible();

        // 3. Create a Group
        await page.getByRole('button', { name: 'New Group' }).click();

        // Modal appears
        await expect(page.getByText('Create New Group')).toBeVisible();
        await page.getByLabel('Group Name').fill('Holiday Trip');
        await page.getByRole('button', { name: 'Create Group' }).click();

        // Wait for modal to close (implies success)
        await expect(page.getByText('Create New Group')).not.toBeVisible();

        // 4. Verify Group Switch
        // Try forcing a refresh just in case the query was stale
        await page.getByTestId('button-refresh').click();

        // Ensure the "No groups yet" message is gone
        await expect(page.getByText('No groups yet')).not.toBeVisible();

        // Verify Header shows the new group name
        await expect(page.getByTestId('header').getByText('Holiday Trip')).toBeVisible();

        // 5. Navigate to Expenses
        await page.getByTestId('button-nav-expenses').click();
        await expect(page.getByText('All Expenses')).toBeVisible();

        // 6. Add Expense
        await page.getByTestId('button-nav-add').click();
        await expect(page).toHaveURL(/.*add-expense/);

        // Verify Add Expense Page
        // Header says "Add Expense"
        await expect(page.getByRole('heading', { name: 'Add Expense' })).toBeVisible();

        await page.getByTestId('input-expense-description').fill('Dinner');
        await page.getByTestId('input-expense-amount').fill('50');

        // Select Category
        await page.getByTestId('select-category').click();
        await page.getByRole('option', { name: 'Food & Dining' }).click();

        await page.getByTestId('button-submit-expense').click();

        // 7. Verify in List (Dashboard)
        await expect(page.getByText('Dinner')).toBeVisible();
        await expect(page.getByText('$50.00')).toBeVisible();

        // 8. Delete Expense (Navigate to Expenses page where delete button exists)
        await page.getByTestId('button-nav-expenses').click();

        // Find the trash icon for the expense
        const deleteBtn = page.locator('[data-testid^="button-delete-expense-"]').first();
        await deleteBtn.click();

        // Confirm dialog
        await page.getByRole('button', { name: 'Delete' }).click();

        // Verify removed
        await expect(page.getByText('Dinner')).not.toBeVisible();
    });

    test('should edit an existing group name and members', async ({ page }) => {
        await page.goto('/groups');

        // 1. Create initial group
        await page.getByRole('button', { name: 'New Group' }).click();
        await page.getByLabel('Group Name').fill('Original Name');
        await page.getByRole('button', { name: 'Create Group' }).click();

        // Wait for creation and verify it appears in the list (H3)
        // Note: Using level 3 to distinguish from the H1 header which also updates
        await expect(page.getByRole('heading', { name: 'Original Name', level: 3 })).toBeVisible();

        // 2. Click Edit button on the group card
        // Note: The UI only shows the Edit button if the user is the owner ('me')
        // In mock storage, createdBy is hardcoded to 'me', so it should appear.
        // We ensure we click the button associated with this specific group card
        await page.locator('.rounded-lg', { hasText: 'Original Name' })
            .getByRole('button', { name: 'Edit' })
            .click();

        // 3. Verify Edit Dialog
        await expect(page.getByRole('heading', { name: 'Edit Group' })).toBeVisible();
        await expect(page.getByLabel('Group Name')).toHaveValue('Original Name');

        // 4. Change Name and Add Member
        await page.getByLabel('Group Name').fill('Renamed Group');
        await page.getByLabel('Members (Optional)').fill('newuser@example.com');

        await page.getByRole('button', { name: 'Update Group' }).click();

        // 5. Verify Updates in Group List
        await expect(page.getByRole('heading', { name: 'Edit Group' })).not.toBeVisible();
        // Check for the new name in the list (H3)
        await expect(page.getByRole('heading', { name: 'Renamed Group', level: 3 })).toBeVisible();
        // Ensure old name is gone from the list
        await expect(page.getByRole('heading', { name: 'Original Name', level: 3 })).not.toBeVisible();

        // 6. Verify Header reflects the change (Group is already active)
        // Since we created it in step 1, it's active. "Switch To" button won't exist.
        // We just verify the header updated.
        await expect(page.getByTestId('header').getByText('Renamed Group')).toBeVisible();

        // 7. Verify member count (Admin + newuser = 2)
        await expect(page.getByTestId('text-participant-count')).toHaveText('2 people');
    });
});
