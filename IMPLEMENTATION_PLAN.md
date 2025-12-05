# Implementation Plan: Decentralized Architecture Migration

## Goal
Transition Quozen from a Node/PostgreSQL architecture to a Serverless/Client-Side architecture using Google Drive as the backend.

## Architecture
- **Frontend**: React + Vite + Tailwind (Shadcn UI)
- **Storage**: Google Sheets API (via Client-Side OAuth)
- **Auth**: Google Identity Services (Implicit Grant / Token)
- **State**: React Query (TanStack)

## Current Status
- [x] Phase 1: Setup & Dependencies
- [x] Phase 2: Google Authentication (Auth Provider & Login)
- [x] Phase 3: Data Layer (Drive Client, Groups, Expenses, Balances)

## Task List

### Phase 4: Cleanup & Configuration (Current Focus)
- [ ] 1. **Vite Cleanup**: Remove API proxy configuration from `vite.config.ts`.
- [ ] 2. **Dependency Audit**: Uninstall server-side packages (`express`, `drizzle-orm`, `passport`, `pg`, etc.) from `package.json`.
- [ ] 3. **Script Cleanup**: Remove server-related scripts (`dev:server`, `db:push`, `test:server`) from `package.json`.
- [ ] 4. **Codebase Pruning**: 
    - Delete `server/` directory.
    - Audit `client/` for any lingering imports from `@shared`.
    - Delete `shared/` directory (if unused).
    - Update `tsconfig.json` to remove server/shared references.
- [ ] 5. **Documentation**: Update `README.md` to reflect the new "Serverless" setup.

### Phase 5: Functionality Gaps (Next)
- [ ] 6. **Edit/Delete Expenses**: Implement `updateRow` and `deleteRow` logic in `drive.ts`.
- [ ] 7. **Manual Refresh**: Add a "Sync/Refresh" button to the UI (since WebSockets are gone).
- [ ] 8. **Offline Resilience**: Add basic `localStorage` caching for the `token`.

### Phase 6: Polish
- [ ] 9. **Error Boundaries**: Handle Drive API quota limits or permission errors gracefully.
