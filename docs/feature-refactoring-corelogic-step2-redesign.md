# Quozen \- Refactoring Core Business Logic for Scalability and Design

# **HIGH-LEVEL ARCHITECTURE**

### **System Context**

Currently, @quozen/core acts as a bucket of utility functions and a leaky StorageService that exposes underlying Google Drive/Sheets implementation details (like spreadsheetId and \_rowIndex).

To prepare for a future REST API (Node.js/Edge) while supporting the current client-side SPA, the core must be restructured into a **Domain-Driven Design (DDD)** architecture. It will act as a standalone SDK (QuozenClient). This SDK will be instantiated per-user-session (in the browser) or per-request (in a REST API), ensuring that authorization contexts do not cross-pollinate.

### **Design Patterns**

1. **Facade Pattern (QuozenClient)**: A single entry point for the consumer. It encapsulates all sub-services (Groups, Ledger, Profile) so consumers don't need to manually wire adapters, parsers, and finance calculators.  
2. **Repository Pattern**: Abstracts the storage backend. GroupRepository and LedgerRepository will handle standard CRUD operations. The consumer will never know the data is stored in Google Sheets.  
3. **Data Mapper Pattern**: A strict boundary between Domain Models (e.g., Expense) and Storage Schemas (e.g., flat arrays in Sheets). Details like \_rowIndex will be strictly internal to the Mapper and never leak to the UI or API responses.  
4. **Proxy/Cache Pattern (Performance)**: Wraps the Google Drive adapter to implement request memoization, modifiedTime checks, and automatic batching to strictly prevent Google API rate-limit exhaustion.

### **Sequence Diagram: Adding an Expense via the New Core API**

Code snippet

sequenceDiagram  
    participant Client as App / REST API  
    participant SDK as QuozenClient  
    participant Ledger as LedgerService  
    participant Mapper as SheetDataMapper  
    participant Cache as Cache Proxy  
    participant Drive as Google Drive API

    Client-\>\>SDK: ledger(groupId).addExpense(payload)  
    SDK-\>\>Ledger: validate(payload, userContext)  
      
    %% Authorization & State check  
    Ledger-\>\>Cache: getGroupMeta(groupId)  
    Cache-\>\>Drive: files.get(fields=modifiedTime)  
    Drive--\>\>Cache: 200 OK (modifiedTime)  
      
    %% Cache Hit/Miss logic abstracted  
    alt Local cache is stale  
        Ledger-\>\>Drive: readGroupData(groupId)  
        Drive--\>\>Ledger: Raw Sheet Data  
    end

    Ledger-\>\>Ledger: Enforce Business Rules (e.g., user is member)  
    Ledger-\>\>Mapper: mapToRow(expense)  
    Mapper--\>\>Ledger: \[id, date, amount, ...\]  
      
    %% Write Operation  
    Ledger-\>\>Drive: appendRow(groupId, "Expenses", rowData)  
    Drive--\>\>Ledger: 200 OK  
      
    Ledger-\>\>Cache: Invalidate/Update Local Cache  
    Ledger--\>\>SDK: Success (Expense Domain Object)  
    SDK--\>\>Client: Expense added successfully

# **DATA MODEL & PERSISTENCE**

## Domain Entities vs. Storage Schemas

We must sever the coupling between how data looks in Google Sheets and how it is consumed by the application.

### The Domain Model (Public)

Exposed to the React App or REST API. No storage specifics.

TypeScript

interface Expense {  
    id: string; // UUID  
    description: string;  
    amount: number; // Stored as integer/cents to avoid float precision issues globally  
    category: string;  
    date: Date;  
    paidByUserId: string;  
    splits: ExpenseSplit\[\];  
    createdAt: Date;  
    updatedAt: Date;  
}

### The Persistence Schema (Private / Internal Mapper)

Used strictly by GoogleDriveAdapter.

* \_rowIndex is kept internally within a WeakMap\<Expense, number\> or a private wrapper class (ExpenseRecord) so it is never serialized to the client.  
* **Decoupling IDs**: Sheets rely on physical rows. We will enforce that the id (UUID) is the *only* valid way to reference an entity from the outside. The LedgerRepository will map id \-\> \_rowIndex internally.

## Caching & Rate-Limiting Strategy

Google Drive API limits are strict (e.g., 100 requests per 100 seconds per user).

1. **Read-Through Metadata Cache**: Before fetching the full spreadsheet (heavy), the core will fetch the file's modifiedTime (light). If it hasn't changed since the last fetch, the core returns data from memory.  
2. **Write Batching**: Provide an addExpenses(expenses\[\]) method that leverages Sheets batchUpdate rather than sequential appendRow calls.  
3. **Concurrency Control**: The existing \_runExclusive mutex in StorageService will be upgraded to an optimistic concurrency control system (ETag/modifiedTime matching) to allow safe parallel scaling in a REST API environment.

# **API CONTRACTS (Core Interface Design)**

Instead of exporting disjointed functions, the core will export a cohesive SDK instance. This structure perfectly mimics a modern SDK (like Stripe or Supabase), making it trivial to wrap in REST controllers later.

### **Core Initialization**

TypeScript

// Initialized per session (SPA) or per request (REST API middleware)

const quozen \= new QuozenClient({

    auth: { token: "user-oauth-token" }, // Extensible for server-to-server auth later

    storage: new GoogleDriveAdapter(),

    cache: new MemoryCacheProvider({ ttl: 60000 }) 

});

### **Group Management (quozen.groups)**

TypeScript

// Fetch groups (uses Settings JSON cache under the hood)  
quozen.groups.list(): Promise\<Group\[\]\>

// Creates a group, creates Settings JSON if missing, applies 'quozen\_type' metadata  
quozen.groups.create(payload: CreateGroupDTO): Promise\<Group\>

// Enforces business rules (e.g. owners cannot leave without transferring ownership)  
quozen.groups.leave(groupId: string): Promise\<void\>

### **Ledger & Financials (quozen.ledger(groupId))**

TypeScript

// Fetches expenses, abstracts cache validation  
quozen.ledger(groupId).getExpenses(options?: { limit?: number }): Promise\<Expense\[\]\>

// Business rule: Throws 'ForbiddenError' if active user is not in the group  
quozen.ledger(groupId).addExpense(payload: CreateExpenseDTO): Promise\<Expense\>

// Hydrates the math engine cleanly  
quozen.ledger(groupId).getAnalytics(): Promise\<LedgerAnalytics\>   
// Returns: { balances: Record\<string, number\>, totalVolume: number, settlementSuggestions: Settlement\[\] }

# **ENGINEER TASK BREAKDOWN**

This breakdown organizes the refactoring into logical phases to ensure the application remains stable while the core is swapped out.

### **Phase 1: Domain Modeling & Data Mappers**

**Task \[CORE-01\]: Define Pure Domain Entities & DTOs**  \[DONE\]

* **Description**: Create strict interfaces for Group, Expense, Settlement, and User in packages/core/src/domain/. Remove all storage-leaking properties like \_rowIndex and JSON stringified arrays from these public interfaces. Create Data Transfer Objects (DTOs) for creation and updates (e.g., CreateExpenseDTO).  
* **Definition of Done**: Interfaces defined and exported. No dependencies on Google APIs.

**Task \[CORE-02\]: Implement SheetDataMapper**  \[DONE\]

* **Description**: Create a Mapper class (packages/core/src/infrastructure/SheetDataMapper.ts). It must contain the logic to transform a flat string array from Google Sheets into the Domain Entities, and vice versa. It must securely manage \_rowIndex mapping privately (e.g., returning a wrapper object internally) so the Domain layer never sees it.  
* **Definition of Done**: Mapper is fully unit-tested with complex stringified JSONs and float values.

### **Phase 2: Repository & Architecture Layers**

**Task \[CORE-03\]: Refactor Storage Adapters to pure IStorageLayer** \[DONE\]

* **Description**: Strip business logic from GoogleDriveAdapter and InMemoryAdapter. They should act *only* as dumb I/O layers (e.g., readRange, writeRange, patchMetadata). All JSON parsing, default value assignment, and schema validation must be moved out of the adapters.  
* **Definition of Done**: Adapters only handle network/memory operations.

**Task \[CORE-04\]: Create GroupRepository & LedgerRepository** \[DONE\]

* **Description**: Implement `GroupRepository` (manages `quozen-settings.json` and group metadata) and `LedgerRepository` (manages rows within a specific group). Inject the `IStorageLayer` and `SheetDataMapper` into these repositories. Implement Optimistic Concurrency Control by comparing `modifiedTime` before writing.  
* **Current State**: `GroupRepository` has `create`, `getSettings`, `reconcile`. `LedgerRepository` has `Expense` CRUD.  
* **Sub-tasks**: \[DONE\] 
  * **LedgerRepository**: Add full CRUD for `Settlement` (add, update, delete) and `Member` (add, delete/leave).  
  * **GroupRepository**: Add `updateGroup` (renaming/member changes), `deleteGroup`, `leaveGroup`, `joinGroup` (magic link), `importGroup` (legacy blessing), and permission management (`setGroupPermissions`, `getGroupPermissions`).  
* **Definition of Done**: Repositories successfully orchestrate reading/writing for ALL entities via the adapter and map data correctly.

---

### **Phase 3: Business Logic & The Facade**

**Task [CORE-05]: Implement Finance / LedgerService** \[DONE\]
* **Description**: Refactor the current `GroupLedger` class into a `LedgerService` that enforces business logic and consumes `LedgerRepository` for data access.
* **Current State**: All underlying CRUD operations (`addSettlement`, `updateExpense`, etc.) are wired.
* **Pending Sub-tasks**:
  * **Domain Analytics Engine**: Port the old `GroupLedger` class into the `domain` folder as a pure `Ledger` entity. Update `LedgerService` to return this hydrated synchronous object instead of a basic `LedgerAnalytics` interface. This is critical so the React UI components (`dashboard.tsx`, `expenses.tsx`) don't break, as they depend on synchronous methods like `getUserBalance(id)`.
* **Definition of Done**: All finance unit tests pass against `LedgerService` and the extracted `Ledger` domain object.

**Task [CORE-06]: Build the QuozenClient Facade** \[DONE\]
* **Description**: Create the main entry point class (`QuozenClient`). It accepts configuration and exposes `.groups` and `.ledger(id)` namespaces. 
* **Current State**: Facade created and wired to repositories, but lacks caching and full configuration injection.
* **Pending Sub-tasks**:
  * **Caching Layer Injection**: Wrap the `GoogleDriveAdapter` in a `Proxy/Cache` pattern (as defined in the architecture) and inject it into the `QuozenClient` constructor to strictly prevent Google API rate-limit exhaustion before we migrate the frontend.
* **Definition of Done**: A consumer can instantiate `QuozenClient` and perform a full lifecycle purely through the facade with caching enabled.

---

### **Phase 4: Webapp Migration & Cleanup**

**Task [WEB-01]: Migrate Webapp Contexts to QuozenClient** [COMPLETED]
* **Description**: Update `apps/webapp/src/lib/drive.ts` and `queryClient.ts`. Instead of exporting singleton functions from `@quozen/core/StorageService`, instantiate `QuozenClient` using the token from `tokenStore`.
* **Definition of Done**: The React application compiles and runs using the new SDK interface. All existing unit tests and integration tests pass.

**Task [WEB-02]: Remove Leaked Abstractions in UI Components** [COMPLETED]
* **Description**: Audit all React components (`ExpensesList`, `EditExpense`, etc.). Ensure no component relies on `_rowIndex`. Update components to consume the clean `Ledger` object instead of manually calculating balances on the frontend.
* **Definition of Done**: End-to-End tests pass. React UI code is significantly smaller and purely focused on presentation.
