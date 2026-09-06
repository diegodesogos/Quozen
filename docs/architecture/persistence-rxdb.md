# Persistence Layer & Local-First Architecture Plan (Final)

This document outlines the proposed architecture to overhaul the Quozen persistence layer. The new design shifts from a synchronous, remote-dependent model to a **Local-First, Offline-Capable, Bring-Your-Own-Backend (BYOB)** architecture using RxDB.

Based on business requirements, this architecture will **preserve Google Sheets compatibility** when the backend is Google Drive, allowing users to directly read and write their data natively in Sheets, while providing a blazing-fast, offline JSON experience in the app.

---

## 1. Proposed Architecture: Local-First with RxDB

The core concept is that the **Local Database (RxDB) is the primary source of truth for the UI**, providing instant reads, optimistic writes, and offline support. The remote backend (Drive, Custom API) acts as a synchronization endpoint.

### 1.1 Why RxDB?
RxDB has been selected as the foundation for the local-first architecture for the following reasons:
- **Future-Proof for Mobile:** RxDB has excellent support for React Native (using SQLite adapters). The exact same core logic, schemas, and sync replication protocols we build for the web will be 100% reusable when Quozen builds a native mobile app.
- **Robustness & Ecosystem:** It is a mature, well-maintained library specifically designed for offline-first applications. It handles complex observables (UI reacts instantly to DB changes) and local querying natively.
- **Clarification on "Heavy":** While RxDB adds some KB to the initial JavaScript bundle size, its runtime performance is exceptionally fast. It easily handles tens of thousands of documents without slowing down mobile browsers or consuming excessive RAM, making it perfectly suited for Quozen ledgers.

### 1.2 Abstracted Storage Interfaces
We will decouple the domain repositories from the backend implementation.

- **`LocalStore` (RxDB)**: Handles immediate reads/writes for the UI using structured JSON documents based on RxDB collections (`expenses`, `settlements`, `members`).
- **`IRemoteBackend`**: The BYOB interface (e.g., `pullChanges()`, `pushChanges()`).

### 1.3 Preserving Google Sheets via `IRemoteBackend`
We do not need a separate "translation service." The responsibility of mapping data falls directly on the specific backend implementation.

If the user connects **Google Drive**:
- The `GoogleDriveBackend` (implementing `IRemoteBackend`) will receive atomic JSON changes pushed from RxDB.
- Internally, this backend implementation will use the existing `SheetDataMapper` to map the JSON documents into native Google Sheet `batchUpdate` or `appendValues` requests.
- When pulling, it reads `batchGetValues` and maps them back into JSON for RxDB.
- This entirely preserves the human-readable spreadsheet format without leaking spreadsheet logic into the core application.

### 1.4 Sync Engine & Conflict Resolution
- **Last-Write-Wins (LWW) & Soft Deletes**: All entities will have `updatedAt` and `deletedAt` timestamps. We will utilize RxDB's custom Replication Protocol, which inherently supports conflict resolution. We will configure it to use LWW based on the `updatedAt` timestamp.
- **Verification & Out-of-Sync State:** Upon full app reload or network reconnection, RxDB's replication protocol will fetch the remote state (or compare `modifiedTime`) and merge any remote changes down to the local database, ensuring consistency.

### 1.5 Schema & Migrations Interaction (Simplified)
To avoid the complexity of managing two separate migration streams (one for local RxDB, one for remote Google Sheets) and to prevent stale local data issues, we will adopt the following strategy:

1. **Remote is the Master Schema:** The existing `ValidationService` and `@qozara/gdocs-schema` will continue to manage the remote Google Sheet's structure.
2. **Local Store as Ephemeral Cache on Upgrade:** When a schema version bump occurs in the app (e.g., app updates from Schema v1 to v2), the app will detect a mismatch between the local RxDB schema version and the app's current schema version.
3. **Wipe and Resync:** Instead of writing local RxDB migration scripts, the app will **wipe the local RxDB instance entirely**. It will then trigger the `ValidationService` to migrate the remote Google Sheet to the new version. Once the remote migration is complete, the app will perform an initial pull to rebuild the local RxDB database from the freshly migrated remote data.
4. **Offline Edge Case:** If a user has pending offline changes on an older schema when an app update happens, they could lose those offline changes when the DB wipes. To mitigate this, updates should ideally occur when the user is online and fully synced.

---

## 2. Dependencies & Workflow Compatibility

An analysis of `docs/architecture` reveals no breaking changes to existing AI or Edge workflows:
- **Agentic UI Workflow (`agentic-ui-workflow.md`)**: The AI routing logic (Proxy vs Local window.ai) relies on the `QuozenClient.ledger().addExpense()` API. Because we are replacing the storage layer *underneath* the `QuozenClient` (abstracting via `LedgerRepository`), the AI logic will continue to function seamlessly without modifications.
- **Edge API Workflow (`edge-api-workflow.md`)**: The Edge Hono router injects the SDK and calls `quozen.ledger('G123').addExpense(dto)`. This will also remain intact. The only difference is that the write operation will now hit the `LocalStore` (if running locally) or immediately sync via the backend adapter (if running statelessly on the edge).

---

## 3. Implementation Steps

#### Phase 1: Local Database Foundation (RxDB)
- Add `updatedAt` and `deletedAt` to all core models (`Expense`, `Settlement`, `Member`).
- Set up the RxDB database and define the JSON schemas for the collections.
- Refactor `LedgerRepository` to perform CRUD operations solely against RxDB (making the UI instantly reactive).

#### Phase 2: Remote Backend Refactoring
- Define the `IRemoteBackend` interface tailored for sync operations (`pull`, `push`).
- Refactor the existing Google Sheets logic into a `GoogleDriveBackend` that implements `IRemoteBackend`, utilizing `SheetDataMapper` internally.

#### Phase 3: RxDB Replication Integration
- Implement an RxDB Custom Replication protocol that binds the RxDB collections to the `IRemoteBackend`.
- Configure the Last-Write-Wins merge logic based on `updatedAt`.
- Integrate the remote schema `ValidationService` wipe-and-resync logic.

#### Phase 4: UI & Context Refactoring
- Update `AutoSyncContext` to monitor RxDB's replication state (e.g., "Syncing", "Offline", "Error").
- Refactor React queries to subscribe directly to RxDB observables, removing the need for manual cache invalidation.
