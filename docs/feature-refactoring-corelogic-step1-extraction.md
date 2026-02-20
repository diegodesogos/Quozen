# **Feature Core Logic Component**

**Status**: Completed

**Title:** Core logic library

**Description:** 
To distribute a pure client-side web app to AI agents and other applications, we must decouple the business logic (the Drive API wrapper and split-bill operations) from the DOM/UI layer.

The most effective approach is to extract Quozen's core logic into an isomorphic TypeScript/JavaScript library (an npm module) that can execute in both the browser and Node.js/Edge environments. Once isolated, we can wrap this library in the two industry-standard specifications depending on where the agent lives: MCP servers and OpenAPI specs (to run on Edge functions)

## Core Logic Extraction - Implementation Plan (Direct Import Strategy)

This plan details the steps required to extract Quozen's core business logic (Drive API wrapper, split-bill operations, and storage mechanisms) into an independent, isomorphic TypeScript/JavaScript library.

**Constraint Update:** We are permitted to update import paths across the test suite and application components to point directly to the new library namespace.

### Phase 1: Library Infrastructure & Workspace Setup [COMPLETED]
**Objective:** Create the foundational structure for the new core library and configure the repository to recognize it as a local workspace package.

* **Task 1.1: Initialize the Monorepo Structure** [DONE]
  * Create a `packages/core` directory.
  * Initialize a `package.json` inside `packages/core` with the name `@quozen/core`.
  * Update the root `package.json` to configure npm/pnpm/yarn workspaces (e.g., `"workspaces": ["packages/*"]`).
* **Task 1.2: Configure Library Build & TypeScript** [DONE]
  * Set up a `tsconfig.json` in `packages/core` targeting both Node.js and Browser environments.
  * Configure Vite/TSup in the core package for independent bundling and type declarations (`.d.ts` generation).
* **Task 1.3: Link Workspace Package** [DONE]
  * Add `@quozen/core` as a dependency in the main application's `package.json` using the workspace protocol (`"workspace:*"` or specific version).
  * Configure the root `tsconfig.json` `paths` or `vite.config.ts` to resolve `@quozen/core` directly to `packages/core/src` for seamless local development without constant rebuilds.


### Phase 2: Decoupling and Extraction [COMPLETED]
**Objective:** Move the pure logic files into the new library structure.

* **Task 2.1: Extract Types and Interfaces** [DONE]
  * Move domain models and types (e.g., from `src/lib/storage/types.ts`) to `packages/core/src/types`.
  * Create proper exports in `packages/core/src/index.ts`.
* **Task 2.2: Extract Financial Math & Logic** [DONE]
*   **Task 2.1: Extract Types and Interfaces** [DONE]
    *   Move domain models and types (e.g., from `src/lib/storage/types.ts`) to `packages/core/src/types`.
    *   Create proper exports in `packages/core/src/index.ts`.
*   **Task 2.2: Extract Financial Math & Logic** [DONE]
    *   Relocate split-bill algorithms, rounding logic, and currency formatters from `src/lib/finance.ts` to `packages/core/src/finance`.
*   **Task 2.3: Extract Storage & Drive Adapters** [DONE]
    *   Move generic storage adapters (`memory-adapter.ts`, `google-drive-adapter.ts`) and Google Drive API wrappers to `packages/core/src/storage` and `packages/core/src/drive`.
    *   Clean up any hardcoded browser-specific dependencies, ensuring they are injected if needed.


### Phase 3: Update Imports Across the Codebase [COMPLETED]
**Objective:** Wire the React application to use the new library.

*   **Task 3.1: Refactor Application Imports** [DONE]
    *   Update `src/lib/storage/index.ts` to bridge local usage to `@quozen/core`.
    *   Search and replace all imports from `@/lib/finance`, `@/lib/storage/types`, etc., with `@quozen/core`.
    *   Ensure aliases are working correctly in both `vite.config.ts` and `vitest.config.ts`.
*   **Task 3.2: Remove Redundant Files** [DONE]
    *   Delete `src/lib/finance.ts`, `src/lib/format-currency.ts`, `src/lib/errors.ts`, and core adapter files in `src/lib/storage`.
*   **Task 3.3: Verification** [DONE]
    *   Run `npm run check` to verify TypeScript integrity.
    *   Run `npm test` to ensure no regressions in logic.

---

## Final Verification [PASSED]
*   **Compilation**: `tsc --noEmit` passes across the workspace.
*   **Tests**: All 105 unit tests (finance logic, storage, and components) pass.
*   **Architecture**: Logic is now properly isolated in `packages/core`, ready for potential Node.js or React Native reuse.

### Phase 4: Validation & CI Pipeline [COMPLETED]
**Objective:** Confirm that the extraction logic is perfectly sound and the integration remains seamless.

* **Task 4.2: Run Application Unit & E2E Tests** [DONE]
  * Execute the remaining app unit tests and Playwright E2E tests (`npm run test:e2e`) from the root to ensure the integration (via imports) is working flawlessly.
* **Task 4.3: Verify Production Build** [DONE]
  * Run the production build (`npm run build`) to ensure Vite correctly resolves the workspace package, bundles it into the app, and that type-checking passes globally.

### Phase 5: Core Library Test Isolation & Expansion [COMPLETED]
**Objective:** Establish a robust, independent test suite for the `@quozen/core` library. Ensure the core logic can be maintained, validated, and extended in complete isolation from the React web application, utilizing mocked authentication and in-memory storage.

* **Task 5.1: Configure Independent Test Environment** [DONE]
  * Set up Vitest (or Jest) specifically within the `packages/core` workspace.
  * Configure `packages/core/vitest.config.ts` to run as a pure Node.js/isomorphic test suite, completely decoupled from React, DOM testing libraries, or the main app's Vite configuration.
* **Task 5.2: Relocate and Adapt Existing Core Tests** [DONE]
  * Move all pure logic tests from the app to the core workspace (e.g., move `src/lib/__tests__/finance*.test.ts`, `src/lib/storage/logic.test.ts`, and `src/lib/storage/memory-provider.test.ts` to `packages/core/tests/`).
  * Refactor the import statements within these moved tests to resolve against the local `src/` directory of the core package.
* **Task 5.3: Enforce Dependency Injection for Storage & Auth** [DONE]
  * Ensure the core library's entry point accepts instances of its dependencies (Storage Adapter, Auth Provider/Token Manager) rather than importing singletons or relying on global state.
  * **Storage:** Configure the core test setup file (`packages/core/tests/setup.ts`) to automatically instantiate the core using the `MemoryAdapter` for all test suites, ensuring fast, state-isolated test runs.
  * **OAuth Bypass:** Implement a `MockAuthProvider` within the test utilities that implements the same interface as the real Google Drive/OAuth provider. This mock must bypass actual network requests and allow injecting dummy tokens or predefined user profiles for testing.
* **Task 5.4: Create New Core-Specific Unit Tests** [DONE]
  * **Adapter Interface Tests:** Write new tests verifying that the `MemoryAdapter` perfectly satisfies the generalized `StorageAdapter` interface required by the core.
  * **Core Integration Flows:** Create tests that validate the end-to-end lifecycle entirely within the core (e.g., `Initialize Core (Mock Auth) -> Save Expense (Memory Store) -> Calculate Settlements -> Verify Result`).
* **Task 5.5: Update CI/CD Pipeline** [DONE]
  * Add a dedicated test script (`"test": "vitest run"`) to `packages/core/package.json`.
  * Update the GitHub Actions workflow (`.github/workflows/ci.yml`) to execute `npm run test --workspace=@quozen/core` as a mandatory, independent step before the main application tests are run.

---

### Phase 6: High-Level API for External Clients [COMPLETED]
**Objective:** Expose a clean, ID-based API surface for the `StorageService` so that external clients (CLI, agents, API wrappers) can retrieve and update data without knowing internal spreadsheet implementation details (like `rowIndex`) or manually unpacking the full `GroupData`.

* **Task 6.1: High-Level Read Methods** [DONE]
  * Added `getGroups`, `getExpenses`, `getSettlements`, `getMembers`, `getExpense`, and `getSettlement` to explicitly query the data model.
* **Task 6.2: Refactor Mutations to use IDs** [DONE]
  * Modified `updateExpense`, `deleteExpense`, `updateSettlement`, and `deleteSettlement` to accept the domain `id` strings instead of `rowIndex`. The service internally resolves the rows via batch fetching to ensure correct targets.
* **Task 6.3: Clean Up React App Coupling** [DONE]
  * Removed all usage of the internal `_rowIndex` property from the React application (`edit-expense`, `expenses`, `activity-hub`, `settlement-modal`), relying strictly on object IDs for data mutations.

### Phase 7: Domain Model Encapsulation (Rich Analytics) [COMPLETED]
**Objective:** Eliminate functional boilerplate in client applications by introducing a `GroupLedger` class. This wrapper will consume raw `GroupData` and expose clean, queryable business methods, ensuring agents and CLI tools don't have to manually execute split-bill math.

* **Task 7.1: Implement `GroupLedger` Core Class** [DONE]
  * Created a class that takes `GroupData` in its constructor.
  * Exposed methods: `getBalances()`, `getUserBalance(userId)`, `getTotalSpent(userId)`, `getExpenseStatus(expense, userId)`, and `getSettleUpSuggestion(userId)`.
  * Internalized the existing functional utilities within these methods.
* **Task 7.2: Extend `StorageService`** [DONE]
  * Added a `getGroupLedger(groupId): Promise<GroupLedger>` method to the `StorageService` to return a fully hydrated analytics object in one call.
* **Task 7.3: React Client Simplification** [DONE]
  * Refactored `Dashboard` and `ExpensesList` to replace manual functional utility calls with the new `GroupLedger` API, significantly reducing UI component complexity.
* **Task 7.4: Ledger Unit Tests** [DONE]
  * Wrote tests in `@quozen/core` to verify the `GroupLedger` seamlessly abstracts the underlying math.


## Final Post-Refactoring Verification [PASSED]
* **Compilation**: `tsc --noEmit` passes across the workspace.
* **Core Tests**: 50 tests passed in `@quozen/core`.
* **App Tests**: 56 unit tests and 7 E2E tests passed.
* **Production**: Build successful and bundles correctly.
* **Monorepo**: Successfully configured with `@quozen/core` as a reusable logic package.