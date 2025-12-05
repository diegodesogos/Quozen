# Migration Plan: Decentralized Architecture (Google Drive)

This plan outlines the steps to migrate Quozen from a centralized Backend/Database architecture to a decentralized Client/Google Drive architecture.

## Phase 1: Setup & Dependencies (✅ Completed)
- [x] **Install Client Dependencies**
  - Added `@react-oauth/google` for client-side authentication.
  - Added `gapi-script` (if needed) or relied on the react wrapper.
- [x] **Environment Configuration**
  - Updated `.env` to include `VITE_GOOGLE_CLIENT_ID`.

## Phase 2: Authentication (✅ Completed)
- [x] **Replace Auth Provider**
  - Updated `client/src/context/auth-provider.tsx` to use Google OAuth implicit flow.
  - Removed backend dependency for session management.
- [x] **Update Login Page**
  - Updated `client/src/pages/login.tsx` to use the Google Sign-In button.
  - Removed username/password forms.
- [x] **Update Entry Point**
  - Wrapped `App` in `GoogleOAuthProvider` in `client/src/main.tsx`.
- [x] **Verify Tests**
  - Updated `login.test.tsx` to match the new UI.

## Phase 3: Data Layer Migration (✅ Completed)
- [x] **Google Drive Client Library**
  - Created/Updated `client/src/lib/drive.ts` to handle:
    - Listing files (Groups).
    - Creating Spreadsheets (New Groups).
    - Reading/Parsing Sheet data (Expenses/Members).
    - Appending rows (Add Expense/Settlement).
- [x] **Groups Feature**
  - Updated `client/src/pages/groups.tsx` to list and create files in Drive.
  - Updated `client/src/App.tsx` to handle initial group loading.
  - Updated `groups.test.tsx`.
- [x] **Expenses Feature**
  - Updated `client/src/pages/expenses.tsx` to read from the active Sheet.
  - Updated `client/src/pages/add-expense.tsx` to write to the active Sheet.
  - Updated `expenses.test.tsx` and `add-expense.test.tsx`.
- [x] **Dashboard & Calculations**
  - Updated `client/src/pages/dashboard.tsx` to fetch sheet data and calculate balances client-side (replacing the `/api/groups/:id/stats` endpoint).
  - Updated `dashboard.test.tsx`.
- [x] **Profile & Navigation**
  - Updated `client/src/pages/profile.tsx` to show user info from Google context.
  - Updated `client/src/components/header.tsx` and `group-switcher-modal.tsx` to use Drive lists.
  - Updated `profile.test.tsx` and `header.test.tsx`.

## Phase 4: Cleanup & Configuration (⏩ NEXT STEP)
- [ ] **Remove Backend Proxy**
  - Update `vite.config.ts` to remove the API proxy to `localhost:5001`.
- [ ] **Clean Package.json**
  - Remove backend-specific scripts (`dev:server`, `db:push`, etc.).
  - Remove backend dependencies (`express`, `drizzle-orm`, `postgres`, etc.) or move them to a legacy folder if keeping for reference.
- [ ] **Remove Server Code**
  - Archive or delete the `server/` directory.
  - Archive or delete the `shared/` directory (if schema is fully migrated to `drive.ts`).
- [ ] **Update Documentation**
  - Final polish on `README.md` to remove instructions for running the backend database.

## Phase 5: Future Enhancements (Backlog)
- [ ] **Edit/Delete Operations**: Implement row updates in `drive.ts` (requires finding row index and using `batchUpdate`).
- [ ] **Real-time Updates**: Implement polling or a manual "Refresh" button since WebSockets are gone.
- [ ] **Offline Support**: Consider `localStorage` caching for read data.

