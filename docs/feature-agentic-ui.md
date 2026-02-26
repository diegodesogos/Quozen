# Quozen \- Agentic UI

## Context (for the Analyst):

I have a client-side serverless app PWA code and core package QuozenClient and my API (read the other MD files to understand architecture). I have most components needed to let my users use this app via an AI agent. 

If the user has a ChatGTP paid account, or Claude, I could just add an MCP server in cloudflare and direct them to add the connector to their agents. But I also want a way of letting users use free web based chatbots like Google Gemini with custom Gems, or just ChatGPT standard free.

Now, let´s consider the following: what about also building a small chat app where all I have to ask the user to do is to provide me an API key (and if not I can use Google’s Cloud free api key with my user for a limited experience). Having the chance of getting an API and adding something to my PWA app could provide a better full chat experience.

## Agentic Client-side App (for the Architect)

This approach is the **"Gold Standard" for modern AI-integrated PWAs**. By moving the "Chatbot" inside your application, we transition from a passive tool to an **Agentic UI**.

Since we already have `@quozen/core` running in the browser and an API (`apps/api`) deployable in Cloudflare Workers and Vercel Edge, we can build a **Hybrid Client-Side Agent**.

### **1\. The Architecture: "The Browser-Based Agent"**

In this model, the "Agent" is just a React Hook that orchestrates three things:

1. **The Brain (LLM):** Decides *what* to do (via API Key or Proxy).  
2. **The Context (RAG):** Reads current state from your Zustand store/`@quozen/core`.  
3. **The Hands (Tools):** Executes functions directly using your existing `QuozenClient`.

#### **The Flow**

1. **User:** "Split lunch $50 with Alice."  
2. **App (Context):** Grabs current Group ID and Member List from `QuozenClient`.  
3. **App (Prompt):** Sends to LLM: *"User said 'Split lunch...'. Tools available: `addExpense`. Current Members: Alice (id: u1), Bob (id: u2)."*  
4. **LLM (Decision):** Returns JSON: `{ "tool": "addExpense", "args": { "amount": 50, "split": {"u1": 25, "u2": 25} } }`.  
5. **App (Execution):** Calls `quozen.ledger(groupId).addExpense(...)`.  
6. **UI:** Updates instantly.

### **2\. Implementation Strategy**

We have two distinct paths to handle the "API Key" dilemma. We should implement **both** for a tiered experience.

#### **Option A: "Bring Your Own Key" (Power Users)**

* **How:** User enters their personal OpenAI/Gemini/Anthropic key in `Settings`.  
* **Storage:** Encrypted using the API proxy, the encrypted value obtained from the Edge function is stored in user’s quozen-settings.json.  
* **Pros:** Unlimited usage, privacy (user trusts their own key), access to smarter models (GPT-4o, Claude 3.5).  
* **Cons:** Friction for non-tech users.

#### **Option B: "The Quozen Free Tier" (Casual Users)**

* **How:** You use your existing `apps/api` (Cloudflare Worker) as a proxy.  
* **Security:**  
  * **Do NOT** put your Google Cloud Key in the client code.  
  * Store the key as a secret in Cloudflare (`wrangler secret put GOOGLE_API_KEY`) or Vercel’s keys.  
  * Create a route `POST /api/v1/agent/chat`.  
  * The PWA sends the message history to this endpoint.  
  * The Worker calls Gemini Flash (very cheap/free tier) and returns the response.  
* **Rate Limiting:** Use Cloudflare's Rate Limiting or Vercel’s own infrastructure, to prevent abuse of your quota.

### **3\. "Magic" Feature: Chrome Built-in AI (Gemini Nano)**

Since we’re building a PWA, we can leverage **`window.ai`** (currently in Chrome Canary/Dev).

* **Concept:** The LLM runs *inside* the user's browser locally.  
* **Cost:** $0.  
* **Privacy:** 100% Local.  
* **Latency:** Near zero.  
* **Implementation:** Check if `window.ai` exists. If yes, use it. If not, ask for API Key. Future improvement: we can deploy the react app as a true local native mobile app and embed the nano LLM there.

### **4\. Architectural Analysis**

Tightly coupling experimental AI features into the core DOM tree is a common trap that inflates bundle sizes and introduces breaking points if remote services degrade. Instead, we will use a **"Feature Module" pattern combined with React Lazy Loading and Context**.

Here is how we integrate it cleanly:

1. **The AI Provider (`AiFeatureProvider`):** We wrap the `AppLayout` in a new context. This provider evaluates the configuration (Auto, BYOK, Local, Cloud) and pings the Edge API/Browser to check availability. If everything fails or the user disables it, the provider sets `isAvailable: false`.  
2. **Lazy Loading (Code Splitting):** All AI logic (`useAgent`, the RAG builder, the `AICommandDrawer`) will live in a dedicated folder (e.g., `src/features/agent`). We will use `React.lazy()` to import it. If `isAvailable` is false, Vite will never even download the AI JavaScript bundle to the user's phone.  
3. **Component Slots (Inversion of Control):** The `Header` component will not import the `Sparkle` button directly. Instead, the `Header` will have a generic `<div id="header-actions-slot" />`. If the AI module loads successfully, it uses a React Portal to inject the Sparkle button into that slot.

This guarantees that if the AI services go down, the core Quozen app remains 100% untouched, fully functional, and lightweight.

### 5\. UX/UI analysis

Regarding UI/UX experience, here is how we can refine your UX proposal to perfectly match Quozen's recent mobile-first design system (which relies heavily on Bottom Drawers):

**1\. The Trigger: The "Sparkle" Icon**

* **Placement:** The upper right corner of the global `Header` is perfect. We can place a `Sparkles` (✨) icon right next to the sync/refresh button.  
* **Visibility:** It will be visible on the Dashboard and Expenses tabs, giving users global access to command the app.

**2\. The Interface: The "AI Command Drawer"**

* Instead of a floating chat window, tapping the sparkle icon opens a **Bottom Drawer** (using your existing `Vaul` drawer implementation).  
* This drawer takes up about 50% of the screen.  
* It contains a large, auto-focused `<textarea>` that says: *"What do you want to do? (e.g., 'Split a $50 Uber with Bob')"*  
* **Voice Input:** We don't need to build a custom microphone/speech-to-text API. By simply using a standard HTML textarea, mobile users can tap the native microphone icon on their iOS/Android keyboard to dictate their commands with perfect OS-level accuracy.

**3\. The Interaction Loop (Feedback)**

1. User types/dictates: *"Alice paid 40 bucks for drinks, split with me."*  
2. User hits the **Submit** arrow.  
3. The Drawer's UI immediately switches to a **"Thinking..." state** (a subtle glowing animation or spinner).  
4. The React Hook (`useAgent`) performs the RAG context build and LLM routing (as we defined earlier).  
5. Upon successful execution, the **Drawer automatically slides down and closes**.  
6. A **Toast Message** appears: *"✅ Added $40 for drinks (Paid by Alice)."*  
7. The underlying Dashboard UI updates instantly via React Query invalidation.

**4\. Transparency Badging**

* Inside this Command Drawer, just below the input box, we will place the tiny dynamic badge we discussed earlier (e.g., *"⚡ Powered by Your Key"* or *"💻 On-Device AI"*). This reassures the user right where they input their data.

By combining a **Global Sparkle Trigger**, an **AI Command Bottom Drawer**, and **Toast-based Feedback**, we keep the app feeling incredibly fast, native, and uncluttered.

### 6\. Summary of Components to Implement

We now have all the pieces for this massive feature:

1. **The Agent Hook & RAG Context Builder**  
2. **The Edge KMS & Proxy** (for secure BYOK encryption and Team Key rate-limiting)  
3. **The 'Auto' Routing Waterfall** (BYOK \-\> Local AI \-\> Team Key)  
4. **The Command Drawer UX** (Invisible execution with Toast feedback)

### **7\. Epic Definition**

This is for the Software Architect to create the detailed plan.

#### **7.1. THE EPIC**

**Title:** Modular Client-Side Agentic UI with Edge KMS 

**Description:** Introduce an Agentic UI allowing users to execute ledger commands via natural language (e.g., "Split a $50 Uber with Alice"). The feature acts as a strictly decoupled, lazy-loaded module. The LLM functions solely as a "Decision Engine" while the React App executes operations via the existing `@quozen/core` SDK. To optimize cost and privacy, the system automatically routes prompts through a waterfall: User's Encrypted Key (BYOK) ➔ Free Browser AI (`window.ai`) ➔ Rate-Limited Team Key (Vercel Edge Proxy). **Success Metrics:**

* **Modularity:** Core app bundle size increases by `< 5kb` when the AI module is not activated.  
* **Intent Accuracy:** \>95% of natural language inputs correctly map to the intended Quozen tool.  
* **Zero-Leakage:** 0 instances of Team API Keys or User API Keys leaking in network payloads or unencrypted Drive files.  
* **Quota Stability:** The Team API Key proxy strictly enforces daily limits per Google User ID via Vercel KV.

#### **7.2. SCOPE & CONSTRAINTS (For the Architect)**

**In-Scope:**

* **Feature Flagging:** `AiFeatureProvider` and `React.lazy()` for strict code-splitting of the AI module.  
* **UX:** A "Sparkle" trigger button portaled into the Header, opening a Vault Bottom Drawer for natural language/dictation input, yielding Toast notifications on success.  
* **Edge KMS & Proxy:** Vercel Edge API routes (`/encrypt` and `/chat`) utilizing `window.crypto` for server-side encryption/decryption, and `@upstash/ratelimit` for quota management.  
* **RAG Context:** A lightweight prompt builder injecting Members, Balances, and Tool Schemas (excluding expense history).  
* **Auto-Routing Waterfall:** Logic to evaluate and fallback between BYOK, Local, and Cloud AI.  
* **New Workspace Module (`apps/ai-proxy`):** A strictly isolated Vercel Edge project dedicated to AI routing, KMS, and rate-limiting.  
* **Feature Flagging:** `AiFeatureProvider` and `React.lazy()` for strict code-splitting of the AI module in the React frontend. The React app must continue operating regardless of availability of AI or not. The feature may also be included or excluded via build environment parameters.  
* **Edge KMS & Proxy (Isolated):** Edge API routes (`/encrypt` and `/chat`) within the `ai-proxy` module utilizing Web Crypto for server-side encryption/decryption, and `@upstash/ratelimit` for quota management.  
* **Auto-Routing Waterfall:** Client-side logic to evaluate and fallback between BYOK, Local Browser AI, and the `ai-proxy` Cloud endpoint.

**Out-of-Scope:**

* Autonomous background agents (execution is strictly synchronous to user prompts).  
* Entire "Agent Views" or generative UI (the UI remains standard Quozen; the AI is just a command interface).  
* Changing the base React Router configuration.  
* **Modifying `apps/api`:** The existing core REST API must remain completely untouched by AI dependencies or KMS logic.  
* Autonomous background agents (execution is strictly synchronous to user prompts).

**Technical Dependencies:**

* `window.crypto.subtle` (Web Crypto API).  
* Chrome `window.ai` API.  
* `@upstash/ratelimit` and `@vercel/kv` (Restricted entirely to `apps/ai-proxy`).  
* OpenAI/Anthropic SDKs (Restricted entirely to `apps/ai-proxy`).

**NFRs:**

* **Fault Tolerance:** If the AI module crashes, the network is down, or `window.ai` hallucinates, the core Quozen ledger experience must remain 100% functional.  
* **Security:** The Edge function must validate the Google OAuth Bearer token before performing any KMS or Proxy operations.  
* **Separation of Concerns:** The `ai-proxy` must not directly interact with Google Drive. It acts purely as a stateless text-in/JSON-out intelligence and encryption layer. The `webapp` remains responsible for executing the returned JSON against Google Drive.

---

#### **7.3. USER STORIES (For the Engineers)**

* **US-101: Pluggable Infrastructure & Auto-Routing Waterfall**  
  * **Narrative:** As an Architect, I want the AI feature to be completely isolated and code-split, So that it does not bloat the core app or cause fatal crashes if AI services are down.  
  * **Scenario 1 (Module Loading):** Given the app loads, When `AiFeatureProvider` evaluates the environment, Then it dynamically imports the `AgentModule` using `React.lazy()` only if the user hasn't explicitly disabled AI.  
  * **Scenario 2 (Auto-Routing):** Given the AI is active, When initializing, Then it checks state in this exact order: 1\) Is an encrypted BYOK present in `quozen-settings.json`? \-\> Use Edge KMS. 2\) Does `window.ai.canCreateTextSession()` return 'readily'? \-\> Use Local AI. 3\) Else \-\> Use Edge Proxy (Team Key).  
  * **Dev Notes:** Add `preferences.aiProvider: 'auto' | 'byok' | 'local' | 'cloud'` to `UserSettings`.  
      
* **US-102: Isolated AI Proxy & Edge KMS Microservice**  
* **Narrative:** As a System Architect, I want the AI capabilities and KMS logic isolated in a separate monorepo package (`apps/ai-proxy`), So that the core REST API, The core QuozenClient and the React app remains lightweight, secure, and free of third-party LLM dependencies.  
* **Scenario 1 (Infrastructure Setup):** Given the monorepo structure, When the developer builds the AI features, Then they initialize a new Hono Edge app at `apps/ai-proxy` with its own `package.json`, `vercel.json`, and isolated environment variables (`LLM_API_KEY`, `KMS_SECRET`, `KV_REST_API_URL`).  
* **Scenario 2 (Encrypting BYOK):** Given the user enters an API key, When the client POSTs to the new proxy's `/encrypt` endpoint, Then the isolated Edge function encrypts it and returns the ciphertext to the client.  
* **Scenario 3 (Rate Limiting & Chat):** Given the user utilizes the Team Key, When they POST to the proxy's `/chat` endpoint, Then Vercel KV checks their Google User ID. If under the limit, it calls the LLM and returns the structured JSON.  
* **Dev Notes:** Ensure the `apps/ai-proxy` endpoints are still protected by the same Google Auth middleware logic used in `apps/api` so that only authenticated Quozen users can consume the AI bandwidth. Since this is decentralized and anyone with a Google account can use it, we may need a way to make requests accepted only if coming from authorized URL domains, where the react app is deployed.  
* **US-103: The AI Command Drawer UX**  
  * **Narrative:** As a User, I want a fast, native-feeling drawer to speak or type my commands, So that I don't feel like I'm leaving the app to use a chat window.  
  * **Scenario 1 (Trigger & UI):** Given the AI module is loaded, When I am on the Dashboard, Then a "Sparkle" icon appears in the Header. Tapping it opens a 50% height bottom drawer with an auto-focused `<textarea>`.  
  * **Scenario 2 (Transparency Badge):** When the drawer opens, Then a small dynamic badge sits below the input indicating the active engine (e.g., "⚡ Powered by Your Key" or "💻 On-Device AI").  
  * **Scenario 3 (Feedback Loop):** Given I submit a command, When the orchestrator executes it successfully, Then the Drawer automatically closes and a success Toast (e.g., "Added $50 for lunch") appears.  
* **US-104: The Agent Orchestrator & RAG Builder**  
  * **Narrative:** As the React Client, I need to build a context-rich prompt and safely parse the output, So that the LLM makes correct decisions based on the current group state.  
  * **Scenario 1 (Context Construction):** When a user submits "Split lunch $50 with Bob", Then the hook fetches the active `Ledger`, extracts the `Members` array (IDs and Names) and `Balances`, and appends the JSON schemas for `addExpense` and `addSettlement`.  
  * **Scenario 2 (Execution):** When the LLM returns the JSON intent, Then the hook maps it to the `QuozenClient`, executes the mutation, and invalidates the `['drive', 'group', id]` React Query to instantly refresh the UI.  
* **US-105: Browser AI (`window.ai`) Fallback**  
  * **Narrative:** As a Chrome user, I want to use free, local AI, So that I don't consume network quotas.  
  * **Scenario 1 (Few-Shot Prompting):** Given `window.ai` is the active router, When the RAG prompt is built, Then it is aggressively prepended with at least 3 examples of User Input \-\> Expected JSON Output to prevent hallucinations.  
  * **Scenario 2 (JSON Extraction):** Given `window.ai` wraps the response in Markdown (e.g., ```` ```json {...} ``` ````), When the client receives it, Then it strips the formatting via regex before parsing.

## 8\. HIGH-LEVEL ARCHITECTURE 

This section was created by the Software Architect, so Software Engineers can understand context and patterns to be used.

### **System Context**

The Agentic UI introduces a natural language command interface to Quozen. To maintain our strict client-side PWA architecture while protecting API keys and bundle sizes, we introduce a **Hybrid Agent Architecture**:

1. **Frontend Isolation (`apps/webapp/src/features/agent`)**: A lazy-loaded module containing the RAG context builder, the UI Drawer, and the LLM Strategy Router. It only loads if the feature is enabled.  
2. **Stateless AI Proxy (`apps/ai-proxy`)**: A completely new, isolated Hono Edge service. It has two responsibilities:  
   * **KMS (Key Management Service):** Encrypts User API keys before they are saved to Google Drive.  
   * **Proxy & Rate Limiting:** Validates Google OAuth tokens, applies Vercel KV rate limits per user, decrypts keys (if BYOK), and forwards requests to the LLM provider.

### **Design Patterns**

1. **Strategy Pattern (Routing):** The client dynamically selects the execution engine: `BYOKStrategy`, `LocalWindowAIStrategy`, or `CloudProxyStrategy`.  
2. **Inversion of Control (Component Slots):** The global `Header` provides a DOM slot. The lazy-loaded AI module injects the "Sparkle" trigger via React Portals, ensuring zero hard dependencies in the main bundle.  
3. **Envelope Encryption (KMS):** The proxy encrypts user keys using a server-side master `KMS_SECRET` via Web Crypto API. The client stores the ciphertext in Google Drive but never knows the secret to decrypt it.

### **Sequence Diagram: Agent Execution Flow**

sequenceDiagram  
    participant User  
    participant App as WebApp (Lazy Module)  
    participant Router as LLM Strategy Router  
    participant Proxy as Edge AI Proxy  
    participant Core as QuozenClient (Core)

    User-\>\>App: "Split a $50 Uber with Bob"  
      
    %% RAG Context Gathering  
    App-\>\>Core: getSettings() & getLedger(activeGroupId)  
    Core--\>\>App: Members (Alice, Bob), Balances, Schemas  
      
    App-\>\>Router: Route Request (Messages, Context, Tools)  
      
    alt Strategy: Cloud Proxy (Team Key or Encrypted BYOK)  
        Router-\>\>Proxy: POST /chat (Messages, Ciphertext?, Auth Token)  
        Proxy-\>\>Proxy: Validate Auth Token  
        Proxy-\>\>Proxy: Check Rate Limit (if no Ciphertext)  
        Proxy-\>\>Proxy: Decrypt Ciphertext (if BYOK)  
        Proxy-\>\>LLM Provider: Generate Text / Tool Call  
        LLM Provider--\>\>Proxy: Tool Intent JSON  
        Proxy--\>\>Router: Tool Intent JSON  
    else Strategy: Local AI (window.ai)  
        Router-\>\>Chrome window.ai: generateText(Few-shot Prompt)  
        Chrome window.ai--\>\>Router: Raw Markdown  
        Router-\>\>Router: Regex Parse JSON  
    end  
      
    %% Execution Phase  
    Router--\>\>App: { tool: "addExpense", args: {...} }  
    App-\>\>Core: ledger.addExpense(args)  
    Core--\>\>App: Success  
    App-\>\>User: Toast: "Added $50 for Uber (Split with Bob)"

# **9\. DATA MODEL & PERSISTENCE**

This section was created by the Software Architect, so Software Engineers can understand context and patterns to be used.

Since Quozen relies on Google Drive (`quozen-settings.json`), we must update the `UserSettings` interface to store AI preferences and the encrypted key.

### **Schema Changes (`@quozen/core/src/domain/models.ts`)**

export interface UserSettings {  
    // ... existing fields ...  
    preferences: {  
        defaultCurrency: string;  
        theme?: "light" | "dark" | "system";  
        locale?: "en" | "es" | "system";  
        // \--- NEW FIELDS \---  
        aiProvider?: "auto" | "byok" | "local" | "cloud" | "disabled";  
    };  
    // Stores the AES-GCM ciphertext of the user's personal API key  
    encryptedApiKey?: string;   
}

# **10\. API CONTRACTS (Interface Design)**

This section was created by the Software Architect, so Software Engineers can understand context and patterns to be used.

These endpoints belong **exclusively** to the new `apps/ai-proxy` edge application.

### **3.1. POST /api/v1/agent/encrypt**

Encrypts a user-provided API key so it can be safely stored in the client's Google Drive.

* **Security:** Requires `Authorization: Bearer <Google_Token>`.  
* **Request Body:** \`\`\`json { "apiKey": "sk-proj-12345..." }  
* **Response (200 OK):**

{ "ciphertext": "a3f9b...\[base64\_encoded\_iv\_and\_data\]" }

### **3.2. POST /api/v1/agent/chat**

The stateless bridge to the LLM. Agnostic to Quozen domain logic; tools are passed in the payload.

* **Security:** Requires `Authorization: Bearer <Google_Token>`. Rate-limited per Google `userId` if `ciphertext` is omitted.  
* **Request Body:**

{  
  "messages": \[{ "role": "user", "content": "Split lunch $50 with Bob" }\],  
  "systemPrompt": "You are Quozen AI. Context: \[Members...\]",  
  "tools": \[...JSON Schema of Quozen Core methods...\],  
  "ciphertext": "a3f9b..." // Optional: If provided, bypasses rate limits and uses BYOK  
}

Response (200 OK):

{  
  "type": "tool\_call",  
  "tool": "add\_expense",  
  "arguments": { "amount": 50, "description": "lunch", ... }  
}

# 11\. ENGINEER TASK BREAKDOWN 

Software Engineer must follow the plan and tasks outlined in this section, in order to implement the Epic features.

## **Phase 1: Core Updates & Settings UI**

**Task \[CORE-01\]: Extend UserSettings Schema**

* **Description:** Update `UserSettings` in `@quozen/core/src/domain/models.ts` and `apps/webapp/src/lib/storage/types.ts` (if duplicated) to include `preferences.aiProvider` and `encryptedApiKey`.  
* **Technical Definition of Done:** Types compile successfully.

**Task \[FE-01\]: Profile Page AI Configuration**

* **Description:** Add an "AI Assistant" section to `Profile.tsx`.  
  * Dropdown for AI Provider: Auto (Default), BYOK, Local Chrome AI, Disabled.  
  * If BYOK is selected, show a password input for the API Key and a "Save Key" button.  
  * *Note: Hooking up the "Save Key" button to the `/encrypt` endpoint is blocked by PROXY-02.*  
* **Technical Definition of Done:** User can modify AI preferences and it correctly persists to `quozen-settings.json`.

## **Phase 2: Edge KMS & AI Proxy (`apps/ai-proxy`)**

**Task \[PROXY-01\]: Initialize `apps/ai-proxy` Workspace**

* **Description:** Create a new Hono project in `apps/ai-proxy`. Configure `package.json` and `wrangler.toml` for Edge deployment. Add required dependencies: `hono`, `@upstash/ratelimit`, `@vercel/kv`, and `@ai-sdk/google` (or `openai`).  
* **Technical Definition of Done:** `npm run dev --workspace=@quozen/ai-proxy` runs a "Hello World" endpoint on port 8788\.

**Task \[PROXY-02\]: Auth Middleware & KMS Encryption Endpoint**

* **Description:** 1\. Port the Google Token validation middleware from `apps/api/src/middleware/auth.ts` into the proxy. 2\. Implement `POST /encrypt`. Use `crypto.subtle` (Web Crypto API) with AES-GCM and a server-side environment variable `KMS_SECRET` (32 bytes) to encrypt the incoming `apiKey`. Return `iv` \+ `ciphertext` as a base64 string.  
* **Technical Definition of Done:** Passing a fake token returns 401\. Passing a valid token and raw key returns an encrypted string.

**Task \[PROXY-03\]: Implement Rate-Limited `/chat` Endpoint**

* **Description:** 1\. Implement `POST /chat`. 2\. If `ciphertext` is in the payload: Decrypt it using `KMS_SECRET` to extract the BYOK. Skip rate limiting. 3\. If `ciphertext` is missing: Use `@upstash/ratelimit` with Vercel KV. Key the limit by the user's Google ID (extracted from Auth Middleware). Limit to e.g., 20 requests/day. Use the server's `GOOGLE_GENERATIVE_AI_API_KEY`. 4\. Pass the `messages`, `systemPrompt`, and `tools` array to the Vercel AI SDK `generateText` function and return the JSON tool call response.  
* **Technical Definition of Done:** Endpoint successfully parses a tool call. Repeated hits without a BYOK trigger a `429 Too Many Requests` response.

## **Phase 3: Frontend Agent Architecture (Strict Isolation)**

**Task \[FE-02\]: Agentic UI Scaffolding & Context Provider**

* **Description:** Create `src/features/agent`.  
  * Create `AiFeatureProvider.tsx` which reads `aiProvider` from `useSettings()`.  
  * If `aiProvider !== 'disabled'`, lazily import the `AgentModule` component.  
  * Add a `<div id="header-actions-slot">` inside `src/components/header.tsx` next to the Sync button.  
* **Technical Definition of Done:** Network tab shows the Agent JS chunk is *only* downloaded when the feature is enabled.

**Task \[FE-03\]: Sparkle Trigger & Command Drawer**

* **Description:** Inside `src/features/agent`, create `AgentCommandDrawer.tsx`.  
  * Use React Portals to render a "Sparkle" button into the `#header-actions-slot`.  
  * Clicking opens a Vaul `Drawer` (50% height).  
  * Include a large `<textarea autoFocus>` and a submit arrow.  
  * Add a dynamic transparency badge (e.g., "⚡ Powered by Team Key", "💻 On-Device").  
* **Technical Definition of Done:** Drawer opens cleanly without altering base app layout.

## **Phase 4: RAG & Execution Logic**

**Task \[FE-04\]: Tool Definitions & RAG Context Builder**

* **Description:** Create `src/features/agent/tools.ts`.  
  * Define JSON Schemas for `@quozen/core` functions: `addExpense`, `addSettlement`.  
  * Create a hook `useRagContext()` that fetches the active `Ledger`, formats `members` (ID, Name) and `getBalances()` into a tight text string to serve as the `systemPrompt`.  
* **Technical Definition of Done:** Context accurately reflects the active group's real-time state without including the entire expense history array.

**Task \[FE-05\]: The Strategy Router & Execution Loop**

* **Description:** Implement `useAgent()` hook.  
  1. **Routing Logic:** Check `aiProvider`. If `auto`, cascade: Check for BYOK in settings \-\> Check `window.ai` \-\> Fallback to Proxy.  
  2. **Execution:** Send prompt to the resolved strategy.  
  3. **Action:** Parse the returned JSON. If `tool === 'addExpense'`, execute `quozen.ledger(activeId).addExpense(args)`.  
  4. **Feedback:** Close drawer, invalidate React Query `['drive', 'group', activeGroupId]`, and fire a success `toast()`.  
* **Technical Definition of Done:** A user can type "I paid $100 for gas, split with Bob" and the UI immediately reflects the new expense in the Dashboard.

**Task \[FE-06\]: Local Browser AI (`window.ai`) Fallback Implementation**

* **Description:** Implement the `LocalWindowAIStrategy`.  
  * Since local models struggle with raw function calling, construct a strictly formatted prompt combining the `systemPrompt`, the user's message, and 3 hardcoded few-shot examples showing exactly how to output the desired JSON.  
  * Implement regex ````/[```]json\n([\s\S]*?)\n[```]/```` to extract JSON from markdown wrappers.  
* **Technical Definition of Done:** Agent functions completely offline/without network requests when `window.ai` is utilized.
