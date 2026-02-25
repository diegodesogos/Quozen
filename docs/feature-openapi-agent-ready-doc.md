#### **1\. THE EPIC**

**Title:** 100% Agent-Ready OpenAPI Refactor for Quozen Edge API **Description:** Transform the existing Quozen REST API into a highly descriptive, agent-consumable interface. By embedding LLM-specific instructions (reasoning constraints, error-handling loops, and domain context) directly into the OpenAPI 3.0 specification for **every single endpoint without exception**, we empower AI agents (via MCP or OpenAI function calling) to autonomously and safely manage user expenses, calculate splits, and recover from data conflicts. **Success Metrics:**

* **100% Endpoint Coverage:** Every single route (Groups, Expenses, Settlements, Ledger) and schema property possesses a semantic `operationId`, a categorizing `tag`, and an LLM-targeted `description`.  
* **Agent Autonomy:** Agents can successfully add an expense and split it equally without asking the user for the member list.  
* **Self-Healing Rate:** 100% of simulated `409 Conflict` errors are successfully caught and retried by the agent automatically.  
* **Tool Call Accuracy:** Zero hallucinated endpoints due to strict, semantic `operationId` naming.

#### **2\. SCOPE & CONSTRAINTS (For the Architect)**

**In-Scope:**

* **Exhaustive Documentation:** Injecting Zod `.describe()` annotations and Route-level `description`, `summary`, `operationId`, and `tags` across **all 11 existing API routes** (and any future ones).  
* Documenting the Optimistic Concurrency Control (409) retry loop specifically on `PATCH /expenses`.  
* Explicit instructions for Ledger mathematical constraints (e.g., sum of splits \= total).

**Out-of-Scope:**

* Adding pagination to the API (the full ledger is lightweight enough for modern LLM context windows).  
* Changing the underlying `@quozen/core` business logic.

**Technical Dependencies:**

* Requires `@hono/zod-openapi` (already configured).

**NFRs:**

* **LLM Parseability:** Descriptions must use imperative, direct language ("You MUST...", "If X, then Y...") which LLMs respond to best.  
* **Strict Completeness:** A PR cannot be approved if a new endpoint or schema property lacks an LLM-specific description.

#### **3\. USER STORIES (For the Engineers)**

* **US-101: 100% Coverage of Semantic Operation IDs & Tagging**  
  * **Narrative:** As an AI Agent, I want *every single endpoint* to have a distinct `operationId` and `tag`, So that I can easily map them to my internal tool-calling interface without confusing Group operations with Expense operations.  
  * **Acceptance Criteria:**  
    * **Scenario 1:** Given the agent parses the OpenAPI JSON, When it looks at the schema, Then there are exactly 0 endpoints missing the `operationId` or `tags` properties.  
    * **Dev Notes:** Group endpoints under `['Groups']`, `['Expenses']`, `['Settlements']`, and `['Analytics']`.  
* **US-102: Agent Reasoning Injection in Schemas**  
  * **Narrative:** As an AI Agent, I want every schema field to tell me its business rules, So that I don't submit invalid data and waste tokens on 400 Bad Request errors.  
  * **Acceptance Criteria:**  
    * **Scenario 1:** Given the user says "I paid $50 for dinner", When the agent reads the `CreateExpenseDTO` description, Then it explicitly reads: *"If the user does not specify how to split the cost, you MUST first fetch the group ledger to get the list of members, and then divide the amount equally."*  
* **US-103: Concurrency & Retry Instructions**  
  * **Narrative:** As an AI Agent, I want to know how to handle specific HTTP errors for mutation endpoints, So that I can autonomously resolve them.  
  * **Acceptance Criteria:**  
    * **Scenario 1:** Given the agent attempts a PATCH and receives a `409 Conflict`, When it reads the endpoint description for `updateGroupExpense`, Then it is instructed to execute a GET request, merge the data, and retry the PATCH.  
* **US-104: Full History Context Instructions for all GET Endpoints**  
  * **Narrative:** As an AI Agent, I want to know the scope of the data returned by all GET endpoints, So that I don't try to hallucinate pagination parameters.  
  * **Acceptance Criteria:**  
    * **Scenario 1:** All GET endpoints (`listGroupExpenses`, `listGroupSettlements`) explicitly state: *"This returns the full history. It is lightweight and safe to consume completely into context."*

### **Explicit Developer Directive: `apps/api/src/routes/groups.ts`**

*Engineer Note: Do not leave a single route untouched. Every route definition in `groups.ts` MUST be updated with the properties shown below to guarantee the Agent can see and use all 11 endpoints.*

// 1\. GROUPS CRUD

const listGroupsRoute \= createRoute({

    method: 'get',

    path: '/',

    operationId: 'listUserGroups', // REQUIRED

    tags: \['Groups'\], // REQUIRED

    summary: 'List user groups',

    description: 'Retrieves all groups the authenticated user belongs to. AGENT INSTRUCTION: Call this first to discover the target \`groupId\` before performing any ledger, expense, or settlement operations.', // REQUIRED

    // ... responses

});

const createGroupRoute \= createRoute({

    method: 'post',

    path: '/',

    operationId: 'createUserGroup', // REQUIRED

    tags: \['Groups'\], // REQUIRED

    summary: 'Create a new group',

    description: 'Creates a new expense sharing group. You can optionally invite members via email or add offline users via username.', // REQUIRED

    // ... request/responses

});

const joinGroupRoute \= createRoute({

    method: 'post',

    path: '/{id}/join',

    operationId: 'joinUserGroup', // REQUIRED

    tags: \['Groups'\], // REQUIRED

    summary: 'Join an existing group',

    description: 'Joins an existing group via its ID. The file must already be shared with the user via Google Drive permissions.', // REQUIRED

    // ... request/responses

});

const updateGroupRoute \= createRoute({

    method: 'patch',

    path: '/{id}',

    operationId: 'updateUserGroup', // REQUIRED

    tags: \['Groups'\], // REQUIRED

    summary: 'Update a group',

    description: 'Updates group name and adds/removes members.', // REQUIRED

    // ... request/responses

});

const deleteGroupRoute \= createRoute({

    method: 'delete',

    path: '/{id}',

    operationId: 'deleteUserGroup', // REQUIRED

    tags: \['Groups'\], // REQUIRED

    summary: 'Delete a group',

    description: 'Permanently deletes a group. Can only be performed by the group owner.', // REQUIRED

    // ... request/responses

});

// 2\. ANALYTICS

const getLedgerRoute \= createRoute({

    method: 'get',

    path: '/{id}/ledger',

    operationId: 'getGroupLedgerAnalytics', // REQUIRED

    tags: \['Analytics'\], // REQUIRED

    summary: 'Get ledger analytics and balances',

    description: 'Retrieves the financial summary and calculated balances of the group. AGENT INSTRUCTION: Use this endpoint to check who owes whom before suggesting or creating a settlement.', // REQUIRED

    // ... request/responses

});

// 3\. EXPENSES CRUD

const getExpensesRoute \= createRoute({

    method: 'get',

    path: '/{id}/expenses',

    operationId: 'listGroupExpenses', // REQUIRED

    tags: \['Expenses'\], // REQUIRED

    summary: 'Get all expenses',

    description: 'Retrieves the full history of expenses for the group. AGENT INSTRUCTION: This returns the entire unpaginated ledger history. It is safe to consume completely into context as the data structure is lightweight.', // REQUIRED

    // ... request/responses

});

const createExpenseRoute \= createRoute({

    method: 'post',

    path: '/{id}/expenses',

    operationId: 'createGroupExpense', // REQUIRED

    tags: \['Expenses'\], // REQUIRED

    summary: 'Create an expense',

    description: 'Creates a new expense. AGENT INSTRUCTION: If the user requests to add an expense but does not explicitly state how to split it, you MUST first call \`getGroupLedgerAnalytics\` to get the list of members, and then split the amount equally among everyone. The sum of all splits MUST exactly equal the total expense amount.', // REQUIRED

    // ... request/responses

});

const updateExpenseRoute \= createRoute({

    method: 'patch',

    path: '/{id}/expenses/{expId}',

    operationId: 'updateGroupExpense', // REQUIRED

    tags: \['Expenses'\], // REQUIRED

    summary: 'Update an expense',

    description: 'Update an existing expense. AGENT INSTRUCTION (CONFLICT HANDLING): This endpoint uses Optimistic Concurrency Control. If you receive a `409 Conflict` response, it means another user modified the expense while you were working. You MUST NOT fail immediately. Instead, call `listGroupExpenses`, find the latest version of this expense, merge the user\'s requested changes, and retry this PATCH request with the new `expectedLastModified` timestamp.', // REQUIRED

    // ... request/responses

});

const deleteExpenseRoute \= createRoute({

    method: 'delete',

    path: '/{id}/expenses/{expId}',

    operationId: 'deleteGroupExpense', // REQUIRED

    tags: \['Expenses'\], // REQUIRED

    summary: 'Delete an expense',

    description: 'Permanently deletes an expense from the ledger.', // REQUIRED

    // ... request/responses

});

// 4\. SETTLEMENTS CRUD

const getSettlementsRoute \= createRoute({

    method: 'get',

    path: '/{id}/settlements',

    operationId: 'listGroupSettlements', // REQUIRED

    tags: \['Settlements'\], // REQUIRED

    summary: 'Get all settlements',

    description: 'Retrieves the full history of settlements (payments) for the group. AGENT INSTRUCTION: This returns the entire unpaginated history.', // REQUIRED

    // ... request/responses

});

const createSettlementRoute \= createRoute({

    method: 'post',

    path: '/{id}/settlements',

    operationId: 'createGroupSettlement', // REQUIRED

    tags: \['Settlements'\], // REQUIRED

    summary: 'Create a settlement',

    description: 'Records a payment between two users. AGENT INSTRUCTION: Always verify current debt using \`getGroupLedgerAnalytics\` before creating a settlement to ensure you are selecting the correct \`fromUserId\` (the person in debt) and \`toUserId\` (the person owed).', // REQUIRED

    // ... request/responses

});

const updateSettlementRoute \= createRoute({

    method: 'patch',

    path: '/{id}/settlements/{settleId}',

    operationId: 'updateGroupSettlement', // REQUIRED

    tags: \['Settlements'\], // REQUIRED

    summary: 'Update a settlement',

    description: 'Updates an existing settlement record.', // REQUIRED

    // ... request/responses

});

const deleteSettlementRoute \= createRoute({

    method: 'delete',

    path: '/{id}/settlements/{settleId}',

    operationId: 'deleteGroupSettlement', // REQUIRED

    tags: \['Settlements'\], // REQUIRED

    summary: 'Delete a settlement',

    description: 'Deletes a settlement record.', // REQUIRED

    // ... request/responses

});

