# **1\.  Agentic UI Feature optionality  \- HIGH-LEVEL ARCHITECTURE**

### **System Context**

Currently, the AI feature is conditionally rendered based purely on user settings, assuming the infrastructure is always available. This refactoring introduces a **Pre-flight Capability Check** pattern. The `AiFeatureProvider` will act as a strict gateway, performing an asynchronous health and configuration check exactly once during app startup. It will expose a React Context (`AiFeatureContext`) so that UI components (like the Profile page) can gracefully adapt their rendering based on the actual availability of the AI infrastructure, rather than assuming it works.

### **Design Patterns**

1. **Pre-flight Check Pattern:** A startup routine that validates environment variables, build flags, and network availability before enabling a subsystem.  
2. **Context/Provider Pattern:** Encapsulates the async state (`checking`, `available`, `unavailable`) and broadcasts it to the DOM tree to prevent prop-drilling.  
3. **Error Boundary (Fallback) Pattern:** Wraps the `React.lazy()` import. If the chunk fails to load (e.g., due to a network drop or bad deployment), the Error Boundary catches the failure, updates the context to `unavailable`, and prevents a white screen of death.

### **Diagrams**

sequenceDiagram  
    participant App as WebApp Root  
    participant Provider as AiFeatureProvider  
    participant Context as AiFeatureContext  
    participant Proxy as Edge AI Proxy  
    participant Profile as Profile UI  
    participant Header as Header Slot

    App-\>\>Provider: Mounts on Startup  
    Provider-\>\>Provider: 1\. Check VITE\_DISABLE\_AI build flag  
    alt Flag is true  
        Provider-\>\>Context: status \= 'unavailable' (Reason: Build flag)  
    else Flag is false  
        Provider-\>\>Provider: 2\. Check VITE\_AI\_PROXY\_URL env var  
        alt Env Var Missing  
            Provider-\>\>Context: status \= 'unavailable' (Reason: Missing Env Var)  
        else Env Var Present  
            Provider-\>\>Proxy: 3\. GET / (Timeout: 3000ms)  
            alt Network Error / Timeout  
                Proxy--\>\>Provider: Fetch Failed  
                Provider-\>\>Context: status \= 'unavailable' (Reason: Proxy Unreachable)  
            else 200 OK  
                Proxy--\>\>Provider: Proxy is Running  
                Provider-\>\>Context: status \= 'available'  
            end  
        end  
    end

    Provider-\>\>Provider: console.info(Reason) if unavailable

    alt is available  
        Provider-\>\>Provider: Render \<Suspense\>\<AgentModule /\>\</Suspense\>  
        Provider-\>\>Header: Portal Sparkle Icon  
        Profile-\>\>Context: Read status  
        Profile-\>\>Profile: Render AI Settings Dropdowns  
    else is unavailable  
        Provider-\>\>Provider: Do not load AgentModule  
        Profile-\>\>Context: Read status  
        Profile-\>\>Profile: Hide Dropdowns, show "AI features not available"  
    end

# **2\. DATA MODEL & PERSISTENCE**

This refactoring is purely client-side runtime state. No database or `quozen-settings.json` schema changes are required.

### **State Structure (Runtime Context)**

We will create a new context interface `AiFeatureState` to manage the lifecycle in memory.

export type AiAvailabilityStatus \= 'checking' | 'available' | 'unavailable';

export interface AiFeatureState {  
    status: AiAvailabilityStatus;  
    reason?: string; // Strictly for debugging/console logging  
}

### **Caching Strategy**

* **Network Check:** The `fetch` call to the proxy's health endpoint (`/`) will be executed exactly once when `AiFeatureProvider` mounts. No polling or intervals will be implemented.  
* **Persistence:** We will *not* persist this availability status to `localStorage`. Infrastructure health is transient and must be re-evaluated on every fresh app load.

# **3\. API CONTRACTS (Interface Design)**

We will utilize the existing root endpoint of `apps/ai-proxy` as our health check.

**Method/Route:** `GET /` (against `VITE_AI_PROXY_URL`)

* **Request Headers:** None required (unauthenticated health check).  
* **Expected Response:** `200 OK` (Text: "Quozen AI Proxy is Running")  
* **Client Handling constraints:** The client `fetch` call must include an `AbortSignal` with a strict timeout (e.g., 3 seconds) to ensure the app doesn't hang in a "checking" state if the edge network drops the packet.

# **4\. ENGINEER TASK BREAKDOWN**

### **Frontend (WebApp) Tasks**

**Task \[FE-01\]: Implement `AiFeatureContext` and Hook [DONE]**

* **Description:** Create `apps/webapp/src/features/agent/AiFeatureContext.tsx`. Define the `AiFeatureState` interface and a `useAiFeature` hook. Provide a default context value of `{ status: 'checking' }`.  
* **Technical Definition of Done:** Hook is exported and throws an error if used outside of the provider.

**Task \[FE-02\]: Implement Startup Pre-flight Checks in Provider [DONE]**

* **Description:** Refactor `apps/webapp/src/features/agent/AiFeatureProvider.tsx`.  
  * Add a `useEffect` with an empty dependency array `[]`.  
  * **Step 1:** Check if `import.meta.env.VITE_DISABLE_AI === 'true'`. If so, set status to `unavailable` and reason to `"Disabled via build configuration"`.  
  * **Step 2:** Check if `import.meta.env.VITE_AI_PROXY_URL` exists. If not, set status to `unavailable` and reason to `"Missing proxy URL in environment"`.  
  * **Step 3:** Perform a `fetch(VITE_AI_PROXY_URL)` using `AbortController` with a 3000ms timeout.  
  * **Step 4:** If the fetch fails or times out, set status to `unavailable` and reason to `"Proxy unreachable or timeout"`. Otherwise, set to `available`.  
  * **Step 5:** `console.info("[Agentic UI] Disabled:", reason)` if unavailable.  
* **Technical Definition of Done:** The context correctly holds `available` or `unavailable` after the initial render cycle. No polling is introduced.

**Task \[FE-03\]: Implement Lazy Load Error Boundary [DONE]**

* **Description:** Create a local `AiErrorBoundary` component within `AiFeatureProvider.tsx` that catches rendering errors from the `React.lazy()` load of `AgentModule`.  
* **Technical Definition of Done:** If `AgentModule` fails to download (e.g., chunk load error), the Error Boundary catches it, gracefully sets the context status to `unavailable` (reason: `"Module load failure"`), and returns `null` (rendering nothing).

**Task \[FE-04\]: Refactor Profile Page UI [DONE]**

* **Description:** Update `apps/webapp/src/pages/profile.tsx` to consume `useAiFeature()`.  
  * If `status === 'checking'`, render a skeleton loader in the AI Assistant card.  
  * If `status === 'unavailable'`, hide the Provider/API Key dropdown inputs completely and render a muted paragraph: *"AI features are currently not available."*  
  * Ensure the card header (Sparkles icon and "AI Assistant" title) remains visible to provide context.  
* **Technical Definition of Done:** Users cannot interact with or view AI settings when the subsystem is disabled.

**Task \[FE-05\]: Cleanup Trigger Logic [DONE]**

* **Description:** Ensure that `AiFeatureProvider.tsx` conditionally renders `<Suspense><AgentModule /></Suspense>` *only* if `status === 'available'`.  
* **Technical Definition of Done:** Since `AgentModule` is responsible for portaling the Sparkle icon into the header (`#header-actions-slot`), preventing its render automatically satisfies the requirement to hide the icon in the upper right corner. No changes to `header.tsx` are required.


# 5\. Debugging Feature 1: Interactive CLI Test Script

### **System Context**

To debug and validate the `apps/ai-proxy` module locally without requiring the entire frontend web app to be running, we will build a standalone Node.js interactive script. This script will leverage Hono's native `app.request()` method, which allows us to simulate HTTP requests directly against the router's instance.

By passing the local `.dev.vars` environment variables directly into the `app.request(req, env)` execution context, we guarantee that the script runs the **exact same middleware, validation, and AI SDK code** that executes in production on Cloudflare Workers or Vercel Edge.

### **Design Patterns**

1. **Simulated Runtime Pattern:** Instead of binding to a network port (e.g., via `serve`), the script invokes the Hono application programmatically. This removes network latency and CORS complexities from the debugging loop.  
2. **Adapter Injection:** The script injects simulated environment bindings (e.g., `KMS_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`) into the Hono context, mimicking the Cloudflare Worker runtime environment.  
3. **REPL (Read-Eval-Print Loop):** Utilizes Node's native `readline/promises` to create a lightweight, dependency-free interactive chat loop in the terminal.

### **Diagrams**

sequenceDiagram

    participant User as Developer (Terminal)

    participant Script as Interactive Script (tsx)

    participant GoogleREST as Google Gemini API (Models)

    participant App as Hono App (src/index.ts)

    participant AI\_SDK as @ai-sdk/google

    

    User-\>\>Script: Run \`npm run test:interactive\`

    Script-\>\>Script: Load \`.dev.vars\` / \`.env\`

    

    %% Model Discovery

    Script-\>\>GoogleREST: GET /v1beta/models?key=...

    GoogleREST--\>\>Script: List of models (gemini-1.5-flash, etc.)

    Script--\>\>User: Prompt to select a model

    User-\>\>Script: Selects "gemini-2.0-flash"

    

    %% Chat Loop

    loop REPL Chat

        User-\>\>Script: Enters chat message

        Script-\>\>App: app.request('/api/v1/agent/chat', { body, headers }, env)

        

        %% Exact same code execution

        App-\>\>App: Auth Middleware (Bypassed via 'mock-test-token')

        App-\>\>AI\_SDK: generateText({ model: selectedModel, messages })

        AI\_SDK-\>\>GoogleREST: POST generateContent

        GoogleREST--\>\>AI\_SDK: AI Response

        AI\_SDK--\>\>App: Normalized Response

        App--\>\>Script: 200 OK (JSON)

        Script--\>\>User: Prints AI Response

    end

## 5.1. DATA MODEL & STATE MANAGEMENT

Since this is a stateless interactive script, persistence is limited to the local environment variables and the in-memory conversation history.

### **State Structure (In-Memory)**

interface ChatMessage {

    role: 'user' | 'assistant' | 'system';

    content: string;

}

// Maintained in the REPL loop to provide conversational context to the LLM

const conversationHistory: ChatMessage\[\] \= \[\];

### **Configuration Loading**

The script will utilize `dotenv` to parse the `apps/ai-proxy/example.dev.vars` (or local `.dev.vars`) to extract:

* `GOOGLE_GENERATIVE_AI_API_KEY`  
* `KMS_SECRET`

---

## 5.2. API CONTRACTS (Interface Design)

### **5.2.1 Model Discovery (External Google API)**

Because the AI SDK abstracts model listing, the script will directly query the Google Generative Language REST API to fetch available models.

* **Method/Route:** `GET https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`  
* **Response Filter:** The script must filter the response where `supportedGenerationMethods` includes `generateContent`.

### **5.2.2 Hono Internal Invocation**

The script will call the proxy's chat endpoint programmatically.

* **Method/Route:** `POST /api/v1/agent/chat` (Simulated via `app.request`)  
* **Headers:** \* `Authorization: Bearer mock-test-token` (Leverages the existing bypass in `src/middleware/auth.ts`)  
  * `Content-Type: application/json`  
* **Request Body:**

{

  "messages": \[ ...conversationHistory \],

  "systemPrompt": "You are a helpful assistant.",

  "tools": \[\] 

}

Injected Environment (Hono Bindings):

{

  "GOOGLE\_GENERATIVE\_AI\_API\_KEY": "\<from\_.dev.vars\>",

  "GOOGLE\_GENERATIVE\_AI\_MODEL": "\<user\_selected\_model\>",

  "KMS\_SECRET": "\<from\_.dev.vars\>"

}

# 6\. Debugging Feature 2: Local LLM Support (Ollama Integration)

### **System Context**

To enable fully localized testing, offline development, and zero-cost debugging, we are extending the `apps/ai-proxy` module to optionally route requests to a local **Ollama** server.

Because we want to maintain the exact same interfaces and schemas, the proxy will still accept the standard tool definitions and require a dummy API key to pass existing validation layers. However, when the environment is configured for Ollama, the proxy will intercept the LLM generation phase and redirect the payload to the local Ollama instance instead of Google's Cloud APIs. The interactive script will also be upgraded to discover models from both Google and Ollama automatically.

### **Design Patterns**

1. **Provider Factory Pattern:** The `ai-proxy` will use a factory function to instantiate the correct Vercel AI SDK provider (`@ai-sdk/google` vs `@ai-sdk/ollama`) based on the environment configuration, keeping the core `generateText` logic agnostic to the underlying LLM.  
2. **Strategy Pattern for Discovery:** The interactive script will implement two discovery strategies (Google REST API vs. Ollama `/api/tags`) and merge the results into a unified model selection list for the developer.

### **Diagrams**

sequenceDiagram  
    participant Dev as Developer (Terminal)  
    participant Script as Interactive Script (tsx)  
    participant Ollama as Local Ollama (Port 11434\)  
    participant App as Hono App (ai-proxy)  
    participant SDK as Vercel AI SDK  
      
    Note over Dev,SDK: Local Execution Mode  
      
    Dev-\>\>Script: Run \`npm run test:ai:interactive\`  
    Script-\>\>Script: Read .dev.vars (AI\_PROVIDER=ollama)  
      
    %% Model Discovery  
    Script-\>\>Ollama: GET http://localhost:11434/api/tags  
    Ollama--\>\>Script: { models: \[{ name: "llama3.2:latest" }\] }  
    Script--\>\>Dev: Prompt to select a model (e.g., llama3.2)  
      
    %% Chat Loop  
    loop REPL Chat  
        Dev-\>\>Script: "Split lunch with Bob"  
        Script-\>\>App: POST /api/v1/agent/chat  
        Note right of Script: Passes "mock-test-token" & Dummy API Key  
          
        App-\>\>App: Auth Middleware (Passes via mock token)  
        App-\>\>App: Key Validation (Passes via dummy key)  
          
        App-\>\>SDK: generateText({ model: ollama(selectedModel), tools })  
        SDK-\>\>Ollama: POST /api/chat (OpenAI compatible or native)  
        Ollama--\>\>SDK: JSON Tool Call Response  
        SDK--\>\>App: Normalized Tool Call  
          
        App--\>\>Script: 200 OK (JSON)  
        Script--\>\>Dev: Prints Tool Execution Intent  
    end

## 6.2. DATA MODEL & STATE MANAGEMENT

### **Configuration Changes (`.dev.vars`)**

We will introduce two new environment variables to `apps/ai-proxy/example.dev.vars` to toggle the routing behavior seamlessly.

\# AI\_PROVIDER can be 'google' or 'ollama'

AI\_PROVIDER=ollama

\# Required if AI\_PROVIDER=ollama (default: http://localhost:11434/api)

OLLAMA\_BASE\_URL=http://localhost:11434/api

\# The proxy will still require these to pass existing validation, 

\# but they will be ignored by the Ollama provider.

GOOGLE\_GENERATIVE\_AI\_API\_KEY=dummy\_key\_for\_ollama

KMS\_SECRET=0123456789abcdef0123456789abcdef

## 6.3. API CONTRACTS (Interface Design)

### **6.3.1 Ollama Model Discovery**

The interactive script will query the local Ollama instance to fetch downloaded models.

* **Method/Route:** `GET /api/tags` (against `OLLAMA_BASE_URL`)  
* **Response Format:**

{

  "models": \[

    { "name": "llama3.2:latest", "modified\_at": "...", "size": 2000000000 }

  \]

}

### **6.3.2 Tool Calling Compatibility Note**

To ensure the output JSON schemas from `ai-proxy` remain identical, the selected Ollama model *must* natively support tool calling. Models like `llama3.1`, `llama3.2`, `mistral`, or `qwen2.5` natively support the Vercel AI SDK tool schemas.

## 7\. ENGINEER TASK BREAKDOWN

### **Feature 1: Interactive CLI Test Script (Google Cloud Baseline)**

**Objective:** Build a standalone REPL script to test the `ai-proxy` logic locally without needing the React frontend, utilizing the default Google Generative AI integration.

**Task \[PROXY-TEST-01\]: Setup Script Infrastructure**

* **Description:** Initialize the interactive script environment in `apps/ai-proxy`.  
* **Implementation:** Add `dotenv` as a dev dependency. Create `scripts/interactive.ts`. Use `dotenv.config({ path: '.dev.vars' })` to load the local environment (specifically `GOOGLE_GENERATIVE_AI_API_KEY` and `KMS_SECRET`).  
* **Definition of Done:** Script runs via `npx tsx scripts/interactive.ts` and successfully loads Google credentials from `.dev.vars`.

**Task \[PROXY-TEST-02\]: Implement Google Model Discovery**

* **Description:** Fetch available Google models so the developer can select one dynamically.  
* **Implementation:** Fetch from `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`. Filter the `models` array for items supporting `"generateContent"` and print them as a numbered list.  
* **Definition of Done:** Script outputs a numbered list of available Google models (e.g., `gemini-2.0-flash`, `gemini-1.5-pro`).

**Task \[PROXY-TEST-03\]: Build the Interactive REPL Loop**

* **Description:** Create the chat loop and invoke the proxy programmatically.  
* **Implementation:** Use `readline/promises` to capture user input. Append input to a `messages` array. Execute `app.request('/api/v1/agent/chat', { ... }, env)` simulating the exact request the frontend makes. Parse and print the proxy's JSON response.  
* **Definition of Done:** Developer can have a multi-turn conversation with Google's LLM directly in the terminal, routed through the Hono app instance.

**Task \[PROXY-TEST-04\]: Document Interactive Script (Google Baseline)**

* **Description:** Expose the script via npm and document the baseline usage.  
* **Implementation:** 1\. Add `"test:interactive": "tsx scripts/interactive.ts"` to `apps/ai-proxy/package.json` and `"test:ai:interactive"` to the root `package.json`. 2\. Create/Update `apps/ai-proxy/README.md` with a section titled **"Testing the Proxy Locally (Google Cloud)"**. 3\. Document the requirement to have `GOOGLE_GENERATIVE_AI_API_KEY` in `.dev.vars`.  
* **Definition of Done:** A developer can read the README, ensure their `.dev.vars` has a Google Key, run `npm run test:ai:interactive`, and test the proxy.

---

### **Feature 2: Local LLM Support (Ollama Integration)**

**Objective:** Extend the `ai-proxy` server to support routing to a local Ollama instance instead of Google, and update the interactive script to recognize this new configuration.

**Task \[OLLAMA-01\]: Implement Provider Factory in AI Proxy**

* **Description:** Refactor the proxy's core LLM invocation to support swapping the provider based on environment variables.  
* **Implementation:** 1\. Install `ollama-ai-provider` in `apps/ai-proxy`. 2\. Update `src/index.ts` to read `AI_PROVIDER` (defaulting to 'google' if missing) and `OLLAMA_BASE_URL`. 3\. Create a factory switch: If `AI_PROVIDER === 'ollama'`, instantiate `createOllama()` and bypass Google API key validation. Otherwise, use `createGoogleGenerativeAI()`.  
* **Definition of Done:** The `POST /api/v1/agent/chat` endpoint successfully forwards requests to a local Ollama server if `AI_PROVIDER=ollama`, returning identically structured JSON tool calls.

**Task \[OLLAMA-02\]: Extend Interactive Script for Dual Discovery**

* **Description:** Make the interactive script (built in Feature 1\) aware of the new Ollama capability.  
* **Implementation:** Read `AI_PROVIDER` in `scripts/interactive.ts`. If it is set to `ollama`, bypass the Google REST fetch and instead fetch from `http://localhost:11434/api/tags`. Parse the models, print them for selection, and execute the REPL loop passing the Ollama configuration in the `env` object.  
* **Definition of Done:** When `AI_PROVIDER=ollama`, running the script lists local models (e.g., `llama3.2:latest`) instead of Google models, and successfully chats with the local model.

**Task \[OLLAMA-03\]: Document Ollama Setup and Configuration**

* **Description:** Provide explicit instructions for setting up the local, offline LLM environment.  
* **Implementation:** Add a new section to `apps/ai-proxy/README.md` titled **"Testing Offline with Local LLMs (Ollama)"**. This section *must specifically instruct the developer to*:  
  1. Download and run Ollama on their machine.  
  2. Run `ollama run llama3.2` to pull a tool-capable model.  
  3. Update their `.dev.vars` with `AI_PROVIDER=ollama` and `OLLAMA_BASE_URL=http://localhost:11434/api`.  
* **Definition of Done:** The documentation clearly separates the standard Google testing flow from the advanced local Ollama testing flow, ensuring developers know exactly what external software (Ollama) and environment variables are required to enable offline proxy execution.
