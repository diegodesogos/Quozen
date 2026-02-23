# **Quozen SDK \- Demo CLI app**  [DONE]

# **HIGH-LEVEL ARCHITECTURE**

### **System Context**

The **Quozen CLI** is a standalone Node.js terminal application that demonstrates the portability of the `@quozen/core` SDK. It runs locally on the user's machine, authenticates via a local browser OAuth 2.0 flow (Loopback IP pattern), and directly interacts with Google Drive using the `GoogleDriveStorageLayer` from the core library. It provides an interactive, menu-driven interface (using a library like `inquirer` or `prompts`) to manage shared expenses without a GUI.

### **Design Patterns**

1. **Command Pattern:** Maps CLI arguments and interactive menu choices to specific domain actions.  
2. **Loopback Server Pattern (OAuth2):** Temporarily spins up a local Express/HTTP server to receive the Google OAuth2 callback code, enabling seamless CLI authentication.  
3. **Adapter Injection:** The CLI injects a Node.js-compatible authentication wrapper into the `GoogleDriveStorageLayer` to seamlessly pipe access tokens to the Core SDK.  
4. **Facade Pattern:** Wraps `console.table` and chalk outputs to format complex `Ledger` data into readable terminal summaries.

### **Sequence Diagram: CLI OAuth & Execution Flow**

sequenceDiagram  
    participant User  
    participant CLI as Quozen CLI  
    participant Auth as Local Auth Server  
    participant Browser  
    participant Google as Google Identity & Drive  
    participant SDK as @quozen/core (QuozenClient)

    User-\>\>CLI: run cli --login  
    CLI-\>\>Auth: Start local server (port 3000\)  
    CLI-\>\>Browser: Open Google Auth URL  
    Browser-\>\>Google: Request Authorization  
    Google--\>\>Browser: Redirect with ?code=XYZ  
    Browser-\>\>Auth: GET http://localhost:3000/callback?code=XYZ  
    Auth--\>\>Browser: "Login successful, close tab"  
    Auth-\>\>Google: Exchange Code for Access/Refresh Tokens  
    Google--\>\>Auth: Tokens  
    Auth-\>\>CLI: Save tokens to OS Keychain / Local Config  
    CLI-\>\>Auth: Stop local server  
      
    User-\>\>CLI: run \`quozen dashboard\`  
    CLI-\>\>SDK: new QuozenClient({ storage, token })  
    CLI-\>\>SDK: quozen.groups.getSettings()  
    SDK-\>\>Google: files.get('quozen-settings.json')  
    Google--\>\>SDK: Settings JSON  
    SDK--\>\>CLI: Settings  
    CLI-\>\>SDK: quozen.ledger(activeGroupId).getLedger()  
    SDK-\>\>Google: Get Sheets Data  
    Google--\>\>SDK: Raw Data  
    SDK--\>\>CLI: Ledger Domain Object  
    CLI-\>\>User: Display Balances (console.table)

# **2\. DATA MODEL & PERSISTENCE**

Since the core data lives entirely in Google Drive (managed by `@quozen/core`), the CLI's persistence layer is strictly limited to managing **authentication state** and **local preferences**.

### **Schema Changes (Local File System)**

**File:** `~/.quozen/credentials.json`

* **Structure:**

{  
  "access\_token": "ya29.a0A...",  
  "refresh\_token": "1//0gA...",  
  "expiry\_date": 1690000000000,  
  "user": {  
    "id": "12345",  
    "email": "user@example.com",  
    "name": "CLI User"  
  }  
}

### **Caching Strategy & Security**

* **Security:** The credentials file must be created with strict permissions (`chmod 600`) to prevent unauthorized access by other OS users. Alternatively, utilize a native keychain library (like `keytar`) for maximum security.  
* **Token Refresh:** The CLI must intercept expired access tokens (401 errors from the SDK) and automatically use the `refresh_token` to obtain a new access token without prompting the user.

# **3\. API CONTRACTS (Interface Design)**

The CLI will act as an interactive prompt wrapper over the `QuozenClient` API.

### **CLI Commands & Interaction Flow**

**1\. Authentication**

* **Command:** `npm run cli -- login`  
* **Action:** Triggers the Loopback Server OAuth2 flow.

**2\. Interactive Dashboard (Main Loop)**

* **Command:** `npm run cli` (or `npm run cli -- interactive`)  
* **Prompt Menu:**

? Quozen CLI \- Select an action:  
❯ View Dashboard (Current Group: Weekend Trip)  
  Switch Group  
  Add Expense  
  Record Settlement  
  Log out

# **4\. ENGINEER TASK BREAKDOWN**

These tasks cover the creation of the demo CLI package, ensuring it links to `@quozen/core` correctly.

### **Phase 1: Infrastructure & Auth (Backend/CLI)**

* **Task \[CLI-01\]: Initialize CLI Workspace**  [DONE]
  * **Description:** Create a new workspace package `apps/cli`. Set up `package.json`, `tsconfig.json`, and link `@quozen/core` as a dependency. Install CLI utility dependencies: `commander`, `prompts` (or `inquirer`), `chalk`, and `open`.  
  * **Technical Definition of Done:** CLI runs a basic "Hello World" command via `npm run dev` from the `apps/cli` folder.  
* **Task \[CLI-02\]: Implement Local OAuth2 Flow**  
  * **Description:** Implement a Google OAuth2 client utilizing the "Loopback IP address" flow (RFC 8252 for native apps).  
    1. Generate a PKCE verifier.  
    2. Start a temporary Express server on port 3000\.  
    3. Use `open` to launch the browser to Google's Auth page.  
    4. Capture the `code` in the local server, close the server, and exchange it for `access_token` and `refresh_token`.  
  * **Technical Definition of Done:** User can run `npm run cli -- login`, browser opens, authorizes, and tokens are securely saved to `~/.quozen/credentials.json` with `600` permissions.  
* **Task \[CLI-03\]: Core SDK Injector & Token Manager**  [DONE]
  * **Description:** Create a utility that reads the local credentials, automatically refreshes the token if expired via Google's token endpoint, and instantiates the `QuozenClient` with the `GoogleDriveStorageLayer`.  
  * **Technical Definition of Done:** A singleton or factory method `getQuozenCliClient()` successfully returns an authenticated `QuozenClient` instance ready for use.

### **Phase 2: Interactive Features (Frontend/CLI UX)**

* **Task \[CLI-04\]: Interactive Main Menu & Group Switcher**  [DONE]
  * **Description:** Implement the main interactive loop using `prompts`. Use `quozen.groups.getSettings()` to retrieve the user's groups. Allow the user to select the active group from a list.  
  * **Technical Definition of Done:** User can select a group and the selection persists in `quozen-settings.json` (SDK handles this internally).  
* **Task \[CLI-05\]: Ledger Dashboard & Console Tables**  [DONE]
  * **Description:** Fetch data using `quozen.ledger(groupId).getLedger()`. Format the `ledger.getBalances()`, `ledger.getSummary()`, and `ledger.getSettleUpSuggestion()` using `console.table` and `chalk` for color-coding (Green for owed, Red for owing).  
  * **Technical Definition of Done:** Command outputs a clean, readable financial summary of the active group.  
* **Task \[CLI-06\]: Add Expense & Settlement Wizards**  [DONE]
  * **Description:** Create step-by-step prompts to add an expense:  
    1. Ask for Description (Text).  
    2. Ask for Amount (Number).  
    3. Ask for Category (Select).  
    4. Fetch members from SDK.  
    5. Ask for splits (Multi-select members, default to equal split).  
    6. Submit via `quozen.ledger(id).addExpense(...)`.  
  * **Technical Definition of Done:** User can successfully add an expense and a settlement entirely through the terminal, and the results immediately sync to the Google Sheet (verifiable via the webapp).

* **Task \[CLI-07\]: Update documentation**  [DONE] 
  * **Description:** Update the main README.md documentation to include the CLI usage instructions.  As well any architecture section and explanation fo the package QuozenClient and how it can be used. Make sure all documents are up-to-date with latest changes
  * **Technical Definition of Done:** Documentation is updated with the QUozenClient new package and CLI usage instructions.