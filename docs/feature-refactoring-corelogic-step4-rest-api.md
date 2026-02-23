# **Technical Design Document: Quozen Edge REST API (OpenAPI 3.0)**

**Epic:** Quozen Edge REST API Integration **Role:** Principal Software Architect / Tech Lead **Status:** Ready for Engineering

---

## **1\. HIGH-LEVEL ARCHITECTURE**

### **System Context**

To enable third-party integrations, AI agents (via MCP or direct API), and future mobile clients, we are introducing a standalone REST API layer. This API will wrap the newly refactored `@quozen/core` (specifically `QuozenClient`).

Because we want high performance, global distribution, and zero-maintenance infrastructure, the API will be built as an **Edge Function** deployable to both **Vercel Edge** and **Cloudflare Workers**.

### **Design Patterns**

1. **Adapter Pattern (Web Standards):** We will use [Hono](https://hono.dev/), an ultrafast, web-standard routing framework that runs natively on Cloudflare Workers, Vercel Edge, Deno, and Node.js.  
2. **Schema-Driven API Design:** We will use `@hono/zod-openapi` to strictly define input/output schemas using Zod. This automatically generates our OpenAPI 3.0 spec and provides runtime validation.  
3. **Middleware Pattern (Auth & Dependency Injection):** A custom authentication middleware will intercept requests, validate the Google OAuth2 Bearer token, construct the `QuozenClient` session, and inject it into the request context.  
4. **Stateless Edge Execution:** Because Edge functions can be spun up/down per request, the API must be entirely stateless. The `StorageCacheProxy` inside `QuozenClient` will only cache operations *within* the lifecycle of a single request or briefly within the Edge isolate's memory.

### **Sequence Diagram: API Request Flow**

sequenceDiagram  
    participant Client as External Client / Agent  
    participant Edge as Edge API (Hono Router)  
    participant Auth as Auth Middleware  
    participant GoogleAuth as Google Identity API  
    participant SDK as QuozenClient (@quozen/core)  
    participant Drive as Google Drive API

    Client-\>\>Edge: POST /api/v1/groups/G123/expenses (Bearer Token)  
    Edge-\>\>Auth: Intercept Request  
      
    Auth-\>\>GoogleAuth: GET /oauth2/v3/userinfo (Validate Token)  
    GoogleAuth--\>\>Auth: User Profile (id, email, name)  
      
    Auth-\>\>SDK: new QuozenClient({ auth, user })  
    Auth-\>\>Edge: Inject SDK into Context (c.set('quozen', sdk))  
      
    Edge-\>\>Edge: Zod Schema Validation (Body & Params)  
    Edge-\>\>SDK: quozen.ledger('G123').addExpense(dto)  
      
    SDK-\>\>Drive: readGroupData (if cache miss)  
    Drive--\>\>SDK: Raw Data  
    SDK-\>\>Drive: appendRow(Expenses, rowData)  
    Drive--\>\>SDK: 200 OK  
      
    SDK--\>\>Edge: Expense Domain Object  
    Edge--\>\>Client: 201 Created (JSON Response)

## **2\. DATA MODEL & PERSISTENCE**

Because this is a wrapper around `@quozen/core`, we do not use an external relational database. Google Drive *is* our database. However, we must map our internal Domain Models to **Zod Schemas** to generate the OpenAPI spec.

### **Zod Schemas (API Boundary)**

import { z } from '@hono/zod-openapi';

// Example: Expense Schema  
export const ExpenseSchema \= z.object({  
  id: z.string().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),  
  description: z.string().openapi({ example: 'Dinner at Mario\\'s' }),  
  amount: z.number().openapi({ example: 45.50 }),  
  category: z.string().openapi({ example: 'Food & Dining' }),  
  date: z.string().datetime().openapi({ example: '2023-10-15T18:00:00Z' }),  
  paidByUserId: z.string().openapi({ example: 'user-google-id' }),  
  splits: z.array(z.object({  
    userId: z.string(),  
    amount: z.number()  
  })),  
  createdAt: z.string().datetime(),  
  updatedAt: z.string().datetime(),  
}).openapi('Expense');

export const CreateExpenseDTOSchema \= ExpenseSchema.omit({   
  id: true, createdAt: true, updatedAt: true   
}).openapi('CreateExpenseRequest');

### **Caching Strategy**

* **Intra-Request:** `@quozen/core` handles sheet-level batching.  
* **Edge Caching:** We will not use Edge network caching (like Cloudflare Cache API) for `GET` requests *unless* we explicitly pass `Cache-Control: private, max-age=30` because the data is highly personalized and depends on the user's specific OAuth token.

---

## **3\. API CONTRACTS (Interface Design)**

### **Authentication**

All endpoints under `/api/v1/*` require a Google OAuth2 Access Token passed in the header: `Authorization: Bearer <google_access_token>`

### **Endpoints**

| Method | Route | Description | Request Body (Schema) | Response (Schema) |
| :---- | :---- | :---- | :---- | :---- |
| GET | /api/v1/groups | List user's groups | \- | 200 OK (Array of Groups) |
| POST | /api/v1/groups | Create a new group | CreateGroupDTO | 201 Created (Group Object) |
| POST | /api/v1/groups/:id/join | Join group via ID | \- | 200 OK (Group Object) |
| GET | /api/v1/groups/:id/ledger | Get full ledger analytics | \- | 200 OK (LedgerAnalytics) |
| GET | /api/v1/groups/:id/expenses | List expenses | \- | 200 OK (Array of Expenses) |
| POST | /api/v1/groups/:id/expenses | Add an expense | CreateExpenseDTO | 201 Created (Expense Object) |
| PATCH | /api/v1/groups/:id/expenses/:expId | Edit an expense | UpdateExpenseDTO | 200 OK (Expense Object) |
| DELETE | /api/v1/groups/:id/expenses/:expId | Delete an expense | \- | 204 No Content |
| POST | /api/v1/groups/:id/settlements | Record settlement | CreateSettlementDTO | 201 Created (Settlement) |

*Error Responses:* Standardized `400 Bad Request` (Zod errors), `401 Unauthorized`, `403 Forbidden`, `409 Conflict` (Optimistic concurrency hit), and `404 Not Found`.

## 3.1 TESTING STRATEGY

To ensure the API is reliable and deployable, we will implement a fast, isolated testing approach using **Vitest** (which is already the standard across the Quozen monorepo).

**Key Pillars of the Strategy:**

1. **Serverless Endpoint Testing:** We will use Hono's `app.request(new Request('http://localhost/api/...'))` feature to test the full HTTP lifecycle (routing, Zod validation, middleware) without opening actual network ports.  
2. **In-Memory Storage Injection:** Instead of connecting to Google Drive during tests, we will inject the existing `InMemoryAdapter` (from `@quozen/core`) into the `QuozenClient`. This ensures tests run in milliseconds and don't hit rate limits.  
3. **Authentication Bypassing:** We will configure the Auth Middleware to recognize a specific `TEST_TOKEN` environment variable. When this token is detected, it will skip the Google `userinfo` API call and inject a predefined mock User object.  
4. **Validation Verification:** We will write deliberate "Bad Request" tests to ensure the `@hono/zod-openapi` schemas properly reject invalid payloads (e.g., negative amounts, missing fields) with `400 Bad Request`.

## **4\. ENGINEER TASK BREAKDOWN**

### **Phase 1: Project Setup & Hono Infrastructure** [DONE]

**Task \[API-01\]: Initialize Edge API Workspace**  [DONE]

* **Description:** Create a new workspace package `apps/api`. Set up a Hono project targeting both Cloudflare Workers and Vercel Edge.  
* **Technical Definition of Done:** \* `package.json` created in `apps/api` depending on `hono`, `@hono/zod-openapi`, `@swagger-api/apidom`, and `@quozen/core`.  
  * Basic Hono app runs locally via `npm run dev` (using Wrangler for local edge simulation or Vite).  
* **Dependencies:** None.

**Task \[API-02\]: Set up OpenAPI Generation & Swagger UI** [DONE]

* **Description:** Configure `@hono/zod-openapi` on the Hono app instance. Expose the raw JSON spec at `/api/openapi.json` and a Swagger UI explorer at `/api/docs`.  
* **Technical Definition of Done:** Visiting `/api/docs` locally renders the Swagger UI.

### **Phase 2: Authentication & Core Injection**

**Task \[API-03\]: Implement Google Auth Middleware**

* **Description:** Create a Hono middleware (`src/middleware/auth.ts`).  
  * Extract Bearer token from `Authorization` header.  
  * Call `https://www.googleapis.com/oauth2/v3/userinfo` with the token.  
  * If valid, extract `id`, `email`, `name`, `picture`.  
  * Instantiate `QuozenClient` using `GoogleDriveStorageLayer` with the token and user info.  
  * Inject the client into the Hono context (`c.set('quozen', client)` and `c.set('user', user)`).  
* **Technical Definition of Done:** Context contains a fully authenticated `QuozenClient`. Invalid tokens return strict `401 Unauthorized`.

### **Phase 3: Zod Schemas & Group Endpoints**

**Task \[API-04\]: Define Zod DTO Schemas**

* **Description:** Translate all `@quozen/core` types (`Group`, `Expense`, `Settlement`, `CreateExpenseDTO`, etc.) into Zod schemas in `src/schemas/`.  
* **Technical Definition of Done:** Schemas are rigorously typed and annotated with `.openapi()` descriptions and examples.

**Task \[API-05\]: Implement Groups Router (`/api/v1/groups`)**

* **Description:** Create OpenAPI routes using `app.openapi(...)` for listing, creating, joining, and deleting groups.  
  * *Implementation note:* Use `const quozen = c.get('quozen')` inside handlers.  
* **Technical Definition of Done:** Endpoints execute successfully against actual Google Drive, and API documentation is automatically populated.

### **Phase 4: Ledger, Expenses & Settlements Endpoints**

**Task \[API-06\]: Implement Ledger & Analytics Routes**

* **Description:** Implement `GET /groups/:groupId/ledger`. This should call `quozen.ledger(groupId).getLedger()` and return the `getSummary()` and `getBalances()` results.  
* **Technical Definition of Done:** Endpoint returns accurate analytical data matching the Core's math engine.

**Task \[API-07\]: Implement Expenses & Settlements CRUD**

* **Description:** Create routers for `/api/v1/groups/:groupId/expenses` and `/api/v1/groups/:groupId/settlements`. Ensure `PATCH` routes catch the `ConflictError` from core and return a `409 Conflict` HTTP status code.  
* **Technical Definition of Done:** Full CRUD capability accessible via Postman/Swagger using an active OAuth token.

### **Phase 5: Edge Deployment Configuration**

**Task \[API-08\]: Configure Cloudflare Workers (`wrangler.toml`)**

* **Description:** Create a `wrangler.toml` at the root of `apps/api`.  
  * Configure `name = "quozen-api"`, `compatibility_date = "2024-01-01"`.  
  * Set `main = "src/index.ts"`.  
* **Technical Definition of Done:** `npx wrangler deploy` successfully publishes the API to Cloudflare.

**Task \[API-09\]: Configure Vercel Edge (`vercel.json`)**

* **Description:** Add Hono's Vercel adapter (`import { handle } from 'hono/vercel'`).  
  * Export the handler explicitly as an Edge function: `export const runtime = 'edge';`.  
  * Provide `vercel.json` routing configuration to direct `/api/*` traffic to the exported handler.  
* **Technical Definition of Done:** Committing to the repo triggers a Vercel build that successfully deploys the API to the Vercel Edge Network.

### **Phase 6: Test Infrastructure & Implementation**

**Task \[API-10\]: Initialize API Test Environment**

* **Description:** Set up Vitest in the `apps/api` workspace.  
  * Create `vitest.config.ts` extending the monorepo standards.  
  * Create a `tests/setup.ts` file to mock global variables (like `fetch` if needed) and set up the dummy `TEST_TOKEN`.  
  * Create a helper function `createTestApp()` that instantiates the Hono app with the `InMemoryAdapter` injected into the context.  
* **Technical Definition of Done:** `npm run test --workspace=@quozen/api` executes successfully and finds the test suite.

**Task \[API-11\]: Implement Auth Middleware Test Bypass**

* **Description:** Modify `src/middleware/auth.ts` to support testing.  
  * If `env.NODE_ENV === 'test'` and the Authorization header equals `Bearer mock-test-token`, inject a mock user (e.g., `Alice`) and skip the Google Identity fetch.  
* **Technical Definition of Done:** Hono `app.request()` calls with the mock token successfully bypass the 401/403 guards without making external network calls.

**Task \[API-12\]: Groups & Ledger Endpoint Tests**

* **Description:** Write unit tests for the group and ledger endpoints in `tests/groups.test.ts`.  
  * **POST `/api/v1/groups`**: Test valid creation (returns 201). Test missing name (returns 400).  
  * **GET `/api/v1/groups`**: Test retrieving the created group.  
  * **GET `/api/v1/groups/:id/ledger`**: Test that a newly created group returns a summary with `totalVolume: 0` and `isBalanced: true`.  
* **Technical Definition of Done:** All group/ledger tests pass locally in isolation.

**Task \[API-13\]: Expenses & Settlements Endpoint Tests**

* **Description:** Write unit tests for financial transactions in `tests/transactions.test.ts`.  
  * **POST `/api/v1/groups/:id/expenses`**: Add a $100 expense. Verify it returns 201 and matches the schema.  
  * **POST `/api/v1/groups/:id/settlements`**: Add a settlement.  
  * **Validation Test**: Send a string instead of a number for `amount`. Verify the API returns `400 Bad Request` with Zod error details.  
  * **Conflict Test**: Attempt a `PATCH` on an expense with an outdated `updatedAt` timestamp. Verify the API returns `409 Conflict`.  
* **Technical Definition of Done:** CRUD operations are fully verified, including schema validation failures and optimistic concurrency hits.

**Task \[API-14\]: CI/CD Pipeline Integration**

* **Description:** Update the GitHub Actions workflow (`.github/workflows/ci.yml`).  
  * Add a new job `test-api` that depends on `test-core`.  
  * The job should run `npm run test --workspace=@quozen/api`.  
* **Technical Definition of Done:** The API tests run automatically on Pull Requests and Pushes to the main branch, blocking the build if they fail.

### **Example Test Implementation (For Engineer Reference)**

*To be placed in `apps/api/tests/expenses.test.ts`*

import { describe, it, expect, beforeEach } from 'vitest';  
import { app } from '../src/index'; // The Hono app instance

describe('POST /api/v1/groups/:id/expenses', () \=\> {  
  it('should create an expense and return 201', async () \=\> {  
    const payload \= {  
      description: 'Test Dinner',  
      amount: 50,  
      category: 'Food',  
      date: new Date().toISOString(),  
      paidByUserId: 'u1',  
      splits: \[{ userId: 'u1', amount: 25 }, { userId: 'u2', amount: 25 }\]  
    };

    // Note: Hono's app.request executes the request through the router   
    // without needing to listen on a local port.  
    const res \= await app.request('/api/v1/groups/G123/expenses', {  
      method: 'POST',  
      headers: {  
        'Authorization': 'Bearer mock-test-token',  
        'Content-Type': 'application/json'  
      },  
      body: JSON.stringify(payload)  
    });

    expect(res.status).toBe(201);  
      
    const data \= await res.json();  
    expect(data.description).toBe('Test Dinner');  
    expect(data.id).toBeDefined();  
  });

  it('should return 400 Bad Request if validation fails', async () \=\> {  
    const invalidPayload \= {  
      description: 'Missing amount',  
      // amount is required by Zod schema but missing here  
      category: 'Food',  
      date: new Date().toISOString()  
    };

    const res \= await app.request('/api/v1/groups/G123/expenses', {  
      method: 'POST',  
      headers: {  
        'Authorization': 'Bearer mock-test-token',  
        'Content-Type': 'application/json'  
      },  
      body: JSON.stringify(invalidPayload)  
    });

    expect(res.status).toBe(400);  
    const error \= await res.json();  
    expect(error.success).toBe(false);  
    expect(error.error.issues\[0\].path\[0\]).toBe('amount');  
  });  
});

### **Phase 7: Monorepo Pipeline & Documentation**

To safely deploy this in a monorepo, we must ensure the `apps/api` package is naturally picked up by the root scripts and that standard documentation is provided for new developers and API consumers.

**Task \[API-15\]: Update Monorepo Build & Test Pipeline**

* **Description:** Update the root `package.json` to seamlessly include the new API in the unified build, test, and type-checking processes, ensuring no deployment happens if any workspace fails.  
* **Implementation Details:**  
  1. Ensure `apps/api/package.json` defines its name as `"name": "@quozen/api"` and depends on `"@quozen/core": "*"`. (This ensures npm/yarn builds `core` before `api` when using `--workspaces`).  
  2. Add/verify the following scripts in the **root** `package.json`:

"scripts": {

  "dev:api": "npm run dev \--workspace=@quozen/api",

  "build:api": "npm run build \--workspace=@quozen/api",

  "test:api": "npm run test \--workspace=@quozen/api",

  "deploy:api:vercel": "npm run build \--workspaces \--if-present && vercel deploy",

  "deploy:api:cf": "npm run build \--workspaces \--if-present && npm run deploy \--workspace=@quozen/api",

  "predeploy": "npm run check && npm run test:all && npm run build"

}

Ensure `apps/api/package.json` contains standard lifecycle scripts (`build`, `dev`, `test`, `check` via `tsc --noEmit`).

**Technical Definition of Done:** Running `npm run predeploy` from the root successfully type-checks (`check`), tests (`test:all`), and builds (`build`) all workspaces (Core, WebApp, CLI, and API) in the correct dependency order.

**Task \[API-16\]: Update Project Documentation (`README.md`)**

* **Description:** Update the core `README.md` to introduce the Edge REST API, explaining how to run it locally, how to access the Swagger UI, and how to authenticate.  
* **Implementation Details:** Add the following section to the `README.md` under the "Architecture & Security" or "Features" section:

\#\# 🌐 Edge REST API (OpenAPI 3.0)

Quozen includes a high-performance, stateless REST API designed to run on Edge networks (Cloudflare Workers, Vercel Edge). It allows third-party integrations and AI agents to manage expenses programmatically.

\#\#\# Local Development  
To start the API locally:  
\\\`\\\`\\\`bash  
npm run dev:api  
\\\`\\\`\\\`

\#\#\# Interactive Documentation (Swagger UI)  
The API is strictly typed using OpenAPI 3.0. When running locally, you can explore and test all endpoints via the Swagger UI:  
👉 \*\*http://localhost:8787/api/docs\*\*

\#\#\# Authentication  
The API uses the exact same Google OAuth2 flow as the web application.   
To authenticate API requests, pass your Google Access Token as a Bearer token in the \`Authorization\` header:

\\\`\\\`\\\`http  
Authorization: Bearer ya29.a0AfB...  
\\\`\\\`\\\`  
\*Note: The API is stateless and does not store your token. It validates it against Google's Identity services on the fly.\*

**Technical Definition of Done:** The `README.md` is updated. A developer reading it can successfully spin up the API and authenticate a request via the Swagger UI using a token generated from the WebApp or CLI.

**Task \[API-17\]: CI/CD Pipeline Update (`.github/workflows/ci.yml`)**

* **Description:** Extend the existing GitHub Actions CI workflow to ensure the API is tested in the cloud before any merges to `main`.  
* **Implementation Details:** Update `.github/workflows/ci.yml` to include the API test job:

\# Job 3: Run API Tests  
test-api:  
  name: 'Run API Tests (Hono/Vitest)'  
  runs-on: ubuntu-latest  
  needs: \[test-core\] \# Must wait for core to be built/tested  
  steps:  
    \- name: Checkout code  
      uses: actions/checkout@v4  
    \- name: Setup Node.js  
      uses: actions/setup-node@v4  
      with:  
        node-version: '20'  
        cache: 'npm'  
    \- name: Install dependencies  
      run: npm ci  
    \- name: Run API tests  
      run: npm run test \--workspace=@quozen/api

**Technical Definition of Done:** GitHub Actions successfully runs and passes the API tests alongside `core`, `webapp,cli`, and E2E tests.
