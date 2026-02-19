# **Feature Core Logic Component**

**Status**: To be done

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


### Phase 2: Decoupling and Extraction
**Objective:** Move the pure logic files into the new library structure.

* **Task 2.1: Extract Types and Interfaces**
  * Move domain models and types (e.g., from `src/lib/storage/types.ts`) to `packages/core/src/types`.
  * Create proper exports in `packages/core/src/index.ts`.
* **Task 2.2: Extract Financial Math & Logic**
  * Relocate split-bill algorithms, rounding logic, and currency formatters from `src/lib/finance.ts` to `packages/core/src/finance`.
* **Task 2.3: Extract Storage & Drive Adapters**
  * Move generic storage adapters (`memory-adapter.ts`, `google-drive-adapter.ts`) and Google Drive API wrappers to `packages/core/src/storage` and `packages/core/src/drive`.
  * Clean up any hardcoded browser-specific dependencies, ensuring they are injected if needed.

### Phase 3: Update Imports Across the Codebase
**Objective:** Wire the existing application and tests to use the newly extracted library.

* **Task 3.1: Refactor Application Imports**
  * Search and replace imports targeting the old `src/lib/finance`, `src/lib/drive`, and `src/lib/storage` paths within UI components and hooks.
  * Point them to the new package: `import { calculateSettlements } from '@quozen/core';`
* **Task 3.2: Refactor Test Imports**
  * Update all import statements within unit tests (`src/lib/__tests__/*`) and E2E tests to point to `@quozen/core`.
  * Relocate the unit tests that specifically test core logic from `src/lib/__tests__` into `packages/core/tests/` to co-locate them with the library.

### Phase 4: Validation & CI Pipeline
**Objective:** Confirm that the extraction logic is perfectly sound and the integration remains seamless.

* **Task 4.1: Run Core Library Tests**
  * Execute the unit tests specifically within the `packages/core` workspace to ensure the pure logic functions perfectly in isolation.
* **Task 4.2: Run Application Unit & E2E Tests**
  * Execute the remaining app unit tests and Playwright E2E tests (`npm run test:e2e`) from the root to ensure the integration (via imports) is working flawlessly.
* **Task 4.3: Verify Production Build**
  * Run the production build (`npm run build`) to ensure Vite correctly resolves the workspace package, bundles it into the app, and that type-checking passes globally.

### Phase 5: Core Library Test Isolation & Expansion
**Objective:** Establish a robust, independent test suite for the `@quozen/core` library. Ensure the core logic can be maintained, validated, and extended in complete isolation from the React web application, utilizing mocked authentication and in-memory storage.

* **Task 5.1: Configure Independent Test Environment**
  * Set up Vitest (or Jest) specifically within the `packages/core` workspace.
  * Configure `packages/core/vitest.config.ts` to run as a pure Node.js/isomorphic test suite, completely decoupled from React, DOM testing libraries, or the main app's Vite configuration.
* **Task 5.2: Relocate and Adapt Existing Core Tests**
  * Move all pure logic tests from the app to the core workspace (e.g., move `src/lib/__tests__/finance*.test.ts`, `src/lib/storage/logic.test.ts`, and `src/lib/storage/memory-provider.test.ts` to `packages/core/tests/`).
  * Refactor the import statements within these moved tests to resolve against the local `src/` directory of the core package.
* **Task 5.3: Enforce Dependency Injection for Storage & Auth**
  * Ensure the core library's entry point accepts instances of its dependencies (Storage Adapter, Auth Provider/Token Manager) rather than importing singletons or relying on global state.
  * **Storage:** Configure the core test setup file (`packages/core/tests/setup.ts`) to automatically instantiate the core using the `MemoryAdapter` for all test suites, ensuring fast, state-isolated test runs.
  * **OAuth Bypass:** Implement a `MockAuthProvider` within the test utilities that implements the same interface as the real Google Drive/OAuth provider. This mock must bypass actual network requests and allow injecting dummy tokens or predefined user profiles for testing.
* **Task 5.4: Create New Core-Specific Unit Tests**
  * **Adapter Interface Tests:** Write new tests verifying that the `MemoryAdapter` perfectly satisfies the generalized `StorageAdapter` interface required by the core.
  * **Core Integration Flows:** Create tests that validate the end-to-end lifecycle entirely within the core (e.g., `Initialize Core (Mock Auth) -> Save Expense (Memory Store) -> Calculate Settlements -> Verify Result`).
  * **Edge Cases:** Add new test cases for previously unhandled edge cases in split-bill logic, multi-currency conversions, and settlement optimizations now that the logic is strictly isolated.
* **Task 5.5: Update CI/CD Pipeline**
  * Add a dedicated test script (`"test": "vitest run"`) to `packages/core/package.json`.
  * Update the GitHub Actions workflow (`.github/workflows/ci.yml`) to execute `npm run test --workspace=@quozen/core` as a mandatory, independent step before the main application tests are run.

