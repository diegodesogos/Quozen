# **Technical Design Document: User Settings & State Persistence**

**Epic:** User Settings & State Persistence (Serverless Profile) 

**Status:** Completed

---

## **1\. HIGH-LEVEL ARCHITECTURE**

### **System Context**

The application currently operates largely "statelessly" regarding application configuration, relying on scanning the user's Google Drive for spreadsheets (`Quozen - *`) on every load to build the group list. This results in inefficient API usage (O(N) operations) and a lack of session memory (e.g., remembering the last active group).

This Epic introduces a **Persistence Layer** backed by a configuration file (`quozen-settings.json`) stored in the root of the user's Google Drive. This file acts as a serverless database for user preferences and a "write-through cache" for file locations, effectively moving the app from a "Scan-on-Load" model to a "Load-from-Config" model.

### **Design Patterns**

1. **Repository Pattern**: The `GoogleDriveProvider` will be enhanced to act as the repository for both Data (Sheets) and Metadata (Settings JSON).  
2. **Write-Through Cache**: All group operations (Create, Join, Delete) will update the local React Query state *and* immediately persist changes to `quozen-settings.json` in the background.  
3. **Lazy Reconciliation**: The app assumes the JSON cache is the source of truth on load. The expensive full Drive scan ("Reconciliation") is only triggered explicitly by the user or if the settings file is missing (First Run).

### **Sequence Diagram: Application Load & Sync**

Code snippet

```
sequenceDiagram
    participant App
    participant AuthProvider
    participant DriveProvider
    participant GDrive as Google Drive API

    App->>AuthProvider: Login Success
    App->>DriveProvider: getSettings()
    
    DriveProvider->>GDrive: files.list(q="name='quozen-settings.json'")
    
    alt Settings File Exists
        GDrive-->>DriveProvider: File ID & Content
        DriveProvider-->>App: Return Cached Groups & Active ID
    else Settings File Missing (First Run)
        DriveProvider->>DriveProvider: reconcileGroups()
        DriveProvider->>GDrive: files.list(q="name contains 'Quozen - '")
        GDrive-->>DriveProvider: List of Sheets
        DriveProvider->>GDrive: files.create('quozen-settings.json', data)
        DriveProvider-->>App: Return Discovered Groups
    end

    App->>App: Initialize Active Group (from settings)
    App->>DriveProvider: getGroupData(activeGroupId)
```

---

## **2\. DATA MODEL & PERSISTENCE**

### **File Storage**

* **Filename:** `quozen-settings.json`  
* **Location:** Root of Google Drive.  
* **MIME Type:** `application/json`

### **JSON Schema (`UserSettings`)**

TypeScript

```
export interface UserSettings {
  // Versioning for future migrations
  version: number; // Start with 1
  
  // State Persistence
  activeGroupId: string | null;
  
  // Cache of groups to avoid scanning Drive on every load
  groupCache: CachedGroup[];
  
  // User Preferences
  preferences: {
    defaultCurrency: string; // e.g., "USD", "EUR"
    theme?: "light" | "dark" | "system";
  };
  
  // Metadata
  lastUpdated: string; // ISO Date
}

export interface CachedGroup {
  id: string;       // Drive File ID
  name: string;     // Group Name (without 'Quozen - ' prefix)
  role: "owner" | "member";
  lastAccessed?: string;
}
```

---

## **3\. API CONTRACTS (Interface Design)**

The `IStorageProvider` interface requires expansion to handle configuration management.

### **3.1. Get Settings**

Retrieves the configuration file or initializes it if missing.

* **Signature:** `getSettings(userEmail: string): Promise<UserSettings>`  
* **Behavior:**  
  1. Query Drive for `name = 'quozen-settings.json' and trashed = false`.  
  2. If found: Download content (`alt=media`), parse JSON, and return.  
  3. If not found: Call `reconcileGroups(userEmail)` to generate initial state, save it, and return.

### **3.2. Save Settings**

Persists changes to Drive.

* **Signature:** `saveSettings(settings: UserSettings): Promise<void>`  
* **Behavior:**  
  1. Use the File ID cached from `getSettings`.  
  2. Perform `files.update` (upload new JSON content).  
  3. Handle `404` (file deleted externally) by falling back to `files.create`.

### **3.3. Reconcile Groups**

Performs a full scan of Drive to rebuild the cache.

* **Signature:** `reconcileGroups(userEmail: string): Promise<UserSettings>`  
* **Behavior:**  
  1. Execute the legacy `listGroups` logic (scan for `Quozen - *`).  
  2. Map results to `CachedGroup[]`.  
  3. Construct a new `UserSettings` object.  
  4. Save to Drive.

---

## **4\. IMPLEMENTATION PLAN (Grouped by User Story)**

### **US-101: Settings Initialization & Self-Healing**

**Goal:** Load app state from `quozen-settings.json` to avoid Drive scanning on launch.

* **Task \[DL-01\]: Define Settings Types & Mock Implementation**  
  * **Status: ✅ Completed**
  * **Description:** Add `UserSettings` and `CachedGroup` interfaces to `src/lib/storage/types.ts`. Update `InMemoryProvider` to store a private `settings` object and implement `getSettings` and `saveSettings` methods (simulating file IO).  
  * **Tech Details:** Ensure `version` defaults to 1\.  
  * **DoD:** Unit tests for `InMemoryProvider` pass; types exported.  
* **Task \[DL-02\]: Implement Settings Logic in GoogleDriveProvider** 
  **Status: ✅ Completed** 
  * **Description:** Implement `getSettings`, `saveSettings`, and `reconcileGroups` in `GoogleDriveProvider`.  
    * `getSettings`: Search for file. If missing, call `reconcileGroups`.  
    * `saveSettings`: Use `files.update`. Cache the Settings File ID in a private class property to optimize subsequent writes.  
    * `reconcileGroups`: Move the *existing* scanning logic from `listGroups` into this new method.  
  * **DoD:** Integration test (or manual verification) showing `quozen-settings.json` is created in Drive on first run.  
* **Task \[FE-01\]: App Initialization & React Query Setup**  
 *  **Status: ✅ Completed**
  * **Description:**  
    * Create `useSettings()` hook using React Query (`queryKey: ['drive', 'settings']`).  
    * Refactor `App.tsx`: On load, fetch settings.  
    * Initialize `activeGroupId` state from `settings.activeGroupId` (if valid), removing the legacy "select first group" logic.  
  * **Dependencies:** DL-01, DL-02  
  * **DoD:** App loads, downloads settings (or creates if missing), and selects the previously active group.

### **US-102: Persist Active Group Selection**

**Goal:** Remember the user's active group across sessions.
* **Status: ✅ Completed**
* **Task \[FE-02\]: Hook Active Group Setter**  
  * **Description:** Modify `AppContext` (or the component handling group switching). When `setActiveGroupId` is called:  
    1. Update local state (immediate UI feedback).  
    2. Mutate `settings` object: set `activeGroupId`.  
    3. Call `googleApi.saveSettings()` (fire-and-forget/debounced).  
  * **DoD:** Switching groups updates `quozen-settings.json` in Drive. Reloading the page retains the selection.

### **US-103: Update Cache on Group Operations**

**Goal:** Keep the JSON cache in sync when groups are added/removed.
* **Status: ✅ Completed**
* **Task \[FE-03\]: Update Cache on CRUD Operations**  
  * **Description:** Update `Groups.tsx`, `AddExpense.tsx`, and `GroupSwitcher.tsx`.  
    * **Create:** After creating a sheet, add it to `settings.groupCache`, set as active, and `saveSettings`.  
    * **Import (Picker):** Add selected file to `groupCache` and `saveSettings`.  
    * **Delete/Leave:** Remove ID from `groupCache` and `saveSettings`.  
  * **Dependencies:** FE-01  
  * **DoD:** Creating a group immediately updates the local cache and the remote JSON file without requiring a re-scan.

### **US-104: Manual Reconciliation (Profile Page)**
* **Status: ✅ Completed**
**Goal:** Allow users to force-sync if files were added on another device.

* **Task \[DL-03\]: Expose Reconcile Method**  
  * **Description:** Ensure `reconcileGroups` is publicly exposed on the `IStorageProvider` interface so the UI can call it directly.  
  * **DoD:** Interface updated.  
* **Task \[FE-04\]: Profile Page UI \- Settings Section**  
  * **Description:** Update `Profile.tsx`.  
    * Add a "Settings" card/section.  
    * Add a button "Scan for missing groups".  
    * On click: Call `googleApi.reconcileGroups()`, invalidate `['drive', 'settings']` query, and show a Toast on completion.  
  * **DoD:** Clicking the button triggers a full Drive scan and updates the group list.

### **US-105: Currency Preference**
* **Status: ✅ Completed**
**Goal:** Save user preference for currency.

* **Task \[FE-05\]: Currency Preference UI**  
  * **Status: ✅ Completed**
  * **Description:**  
    * In `Profile.tsx` (Settings section), add a dropdown for Currency (USD, EUR, GBP, etc.).  
    * Bind value to `settings.preferences.defaultCurrency`.  
    * On change: Update local settings cache and call `saveSettings`.  
  * **DoD:** Selection is persisted to JSON file.

### **US-106: Active Group Sync (Header Refresh)**
* **Status: ✅ Completed**
**Goal:** Optimize the refresh button to stop scanning the whole Drive.

* **Task \[FE-06\]: Optimize Header Refresh Logic**  
  * **Status: ✅ Completed**
  * **Description:** Update `handleRefresh` in `Header.tsx`.  
    * **Old Behavior:** `invalidateQueries(['drive'])` (Refreshed settings, group list, and active group data).  
    * **New Behavior:** `invalidateQueries(['drive', 'group', activeGroupId])`. This only re-fetches the *contents* (expenses/members) of the currently open spreadsheet.  
  * **DoD:** Clicking refresh updates expenses but does not trigger a network request for `quozen-settings.json` or `files.list`.

### **Migrations / Cleanup**
* **Status: ✅ Completed**
* **Task \[MG-01\]: Legacy Code Removal**  
  * **Description:** Modify `GoogleDriveProvider.listGroups`. It should now strictly return `settings.groupCache` (via `getSettings`). The "scan on load" logic inside `listGroups` should be removed (it now lives in `reconcileGroups`).  
  * **DoD:** `listGroups` is O(1) (reading from memory/JSON), not O(N) (scanning Drive).

## **5\. Annex. Epic, User Stories and Constraints**

The following is the full spec of the user stories for further reference when implementing the above mentioned tasks. Take this into consideration to clarify any doubts about requested tasks.

**Title:** User Settings & State Persistence (Serverless Profile)

**Description:** Implement a persistent user profile and application state stored as a configuration file (`quozen-settings.json`) in the user's Google Drive. This moves the application from a stateless "scan-on-load" model to a "load-from-config" model.

Currently, the `Groups` page and `Header` component fetch the group list by scanning the entire Drive every time the app loads. This Epic will refactor this logic to read from the settings file first. It separates the concepts of "Syncing Data" (Active Group) and "Reconciling Groups" (Finding files), placing them in the appropriate UI contexts to optimize performance and API usage.

**Success Metrics:**

* **App Load Time:** Reduce "Checking for groups..." time by 80% (replacing `drive.files.list` with specific `drive.files.get`).  
* **State Persistence:** User returns to the exact group they left in the previous session.  
* **API Efficiency:** The "Refresh" button in the header no longer costs a Drive List quota unit.  
  ---

  ### **5.1. SCOPE & CONSTRAINTS**

**In-Scope:**

* Creation and management of `quozen-settings.json` in the root of Google Drive.  
* Schema definition for the settings file (active group, group cache, user preferences).  
* **Refactoring Data Layer:**  
  * Rewrite `GoogleDriveProvider.listGroups` to read from settings JSON by default.  
  * Ensure `getGroupData` (expenses) is only called for the `activeGroupId`.  
* **Refactoring UI:**  
  * **Header:** Update Refresh button to only invalidate the active group query.  
  * **Profile Page:** Add a "Settings" section with a "Scan for missing groups" (Reconcile) button.  
* Updating `Create`, `Import` (via Picker), `Delete`, and `Leave` flows to write to the settings file.  
* Robust Reconciliation logic (pagination, backoff) for the Profile page action.

**Out-of-Scope:**

* Real-time multi-device sync (last write wins).  
* Storing sensitive auth tokens in the file.

**Technical Dependencies:**

* Existing `GoogleDriveProvider`.  
* Google Drive API (`files.get`, `files.create`, `files.update`, `files.list`).  
  ---

  ### **5.2. USER STORIES**

  #### **US-101: Settings Initialization & Self-Healing**

**Narrative:** As a User, I want the app to load my settings automatically when I log in, so that I pick up exactly where I left off without scanning my whole Drive.

**Acceptance Criteria:**

* **Scenario 1: Standard Load**  
  * **Given** a valid `quozen-settings.json` exists.  
  * **When** I log in.  
  * **Then** the app downloads this file directly.  
  * **And** the Group List is populated instantly from the JSON data.  
  * **And** the `activeGroupId` from the settings is automatically selected, triggering the Dashboard to load expenses *only* for that group.  
* **Scenario 2: First Run / Missing File**  
  * **Given** `quozen-settings.json` is missing.  
  * **When** I log in.  
  * **Then** the app triggers the **Reconciliation Process** (US-104) to scan Drive.  
  * **And** creates a new settings file with the results.

**Dev Notes:**

* **Refactoring `listGroups`:**  
  1. Attempt `files.list(q="name = 'quozen-settings.json'")`.  
  2. If found: `files.get(alt=media)`. Return `content.groups`.  
  3. If not found: Call `reconcileGroups()` (US-104).

  #### **US-102: Persist Active Group Selection**

**Narrative:** As a User, I want the app to save my active group selection, so that I don't default to the top of the list on every reload.

**Acceptance Criteria:**

* **Scenario 1: Switching Groups**  
  * **Given** I am viewing "Group A".  
  * **When** I switch to "Group B" via the Group Switcher.  
  * **Then** the `activeGroupId` in `quozen-settings.json` is updated to Group B's ID in the background (fire-and-forget).  
  * **And** the UI immediately fetches expenses for Group B.  
  * **And** the UI does *not* fetch expenses for Group A anymore.

**Dev Notes:**

* Current implementation (`App.tsx` \+ `dashboard.tsx`) already relies on `activeGroupId` state. We simply need to hook the `setActiveGroupId` setter to also write to the settings file.

  #### **US-103: Update Cache on Group Operations**

**Narrative:** As a User, I want my settings to update automatically when I create or import groups, so that the list stays accurate without manual syncing.

**Acceptance Criteria:**

* **Scenario 1: Creating/Importing**  
  * **When** I create a new group or Import one via Google Picker.  
  * **Then** the new group is added to the `groups` array in `quozen-settings.json`.  
  * **And** `activeGroupId` is updated to this new group.  
* **Scenario 2: Deleting/Leaving**  
  * **When** I delete or leave a group.  
  * **Then** that group is removed from the `groups` array in settings.

  #### **US-104: Manual Reconciliation (Profile Page)**

**Narrative:** As a User, I want a specific "Scan for missing groups" button in my **Profile**, so that I can find groups created on other devices if the cache is out of date.

**Acceptance Criteria:**

* **Scenario 1: Triggering Scan**  
  * **Given** I am on the Profile page settings section.  
  * **When** I click "Scan Drive for Groups".  
  * **Then** the app performs a full `files.list` query for `name contains 'Quozen - '`.  
  * **And** handles pagination (if \>100 files) and rate limits (403/429) gracefully.  
  * **And** overwrites `quozen-settings.json` with the fresh list.  
  * **And** a toast confirms "Group list updated".

**Dev Notes:**

* This logic moves *out* of the default load path and into this specific action.  
* Use exponential backoff for the scan loop: implement exponential backoff when retrying API requests that fail with rate-limit errors (e.g., 403, 429) during the Drive scan.

  #### **US-105: Currency Preference**

**Narrative:** As a User, I want to set a default currency, so that I don't have to configure it for every new expense.

**Acceptance Criteria:**

* **Scenario 1: Setting Currency**  
  * **Given** I am on the Profile page.  
  * **When** I select "EUR" from the Currency dropdown.  
  * **Then** `preferences.defaultCurrency` is updated in `quozen-settings.json`.

  #### **US-106: Active Group Sync (Header Refresh)**

**Narrative:** As a User, I want the "Refresh" button in the header to only sync the **current** group, so that I can see recent expenses quickly without waiting for a full drive scan.

**Acceptance Criteria:**

* **Scenario 1: Clicking Refresh**  
  * **Given** I am viewing "Group A".  
  * **When** I click the Refresh icon in the Header.  
  * **Then** the app invalidates the query `["drive", "group", "GroupA_ID"]`.  
  * **And** it re-fetches the Expenses and Members for Group A from Google Sheets.  
  * **And** it does **NOT** invalidate `["drive", "groups"]` (it does not scan Drive for files).

**Dev Notes:**

* **Refactoring `Header.tsx`:** Change `queryClient.invalidateQueries({ queryKey: ["drive"] })` to `queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] })`.

