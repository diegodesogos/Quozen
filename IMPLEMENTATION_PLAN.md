# Implementation Plan: Decentralized Architecture Migration

## Goal
Transition Quozen from a Node/PostgreSQL architecture to a Serverless/Client-Side architecture using Google Drive as the backend.

## Architecture
- **Frontend**: React + Vite + Tailwind (Shadcn UI)
- **Storage**: Google Sheets API (via Client-Side OAuth)
- **Auth**: Google Identity Services (Implicit Grant / Token)
- **State**: React Query (TanStack)

# Implementation Plan: Decentralized Architecture Migration

## Current Status
- [x] Phase 1: Setup & Dependencies
- [x] Phase 2: Google Authentication (Auth Provider & Login)
- [x] Phase 3: Data Layer (Drive Client, Groups, Expenses, Balances)
- [x] Phase 4: Cleanup & Configuration
  - [x] Delete `server/` and `shared/` directories.
  - [x] Purge Node.js backend dependencies from `package.json`.
  - [x] Reconfigure `vercel.json` for static deployment.
  - [x] Flatten repository structure (move `client/*` to root).
  - [x] Unify TypeScript and Vitest configuration.

## Task List

### Phase 5: Functionality Gaps (Next)
- [ ] 1. **Edit/Delete Expenses**: Implement `updateRow` and `deleteRow` logic in `drive.ts`.
- [ ] 2. **Manual Refresh**: Add a "Sync/Refresh" button to the UI (since WebSockets are gone).
- [ ] 3. **Offline Resilience**: Add basic `localStorage` caching for the `token`.

### Phase 6: Polish
- [ ] 4. **Error Boundaries**: Handle Drive API quota limits or permission errors gracefully.
- [ ] 5. **Documentation**: Finalize `README.md`.

## Cleanup Actions Required
The following directories are now obsolete and should be deleted from the project:
- `server/`
- `shared/`
