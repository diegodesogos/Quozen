# **Epic: Automatic Smart Synchronization**

**Status:** ✅ **Implementation Complete**
Pending tests and final review

## **Implementation Status**

| ID | Title | Status | Notes |
| :--- | :--- | :--- | :--- |
| **US-301** | Smart Polling Infrastructure | ✅ **Completed** | Context created, storage adapters updated with `getLastModified`. |
| **US-302** | Route-Based Guard | ✅ **Completed** | Auto-pause on `/add-expense`, `/edit-expense`, `/join`. |
| **US-303** | Modal-Based Guard | ✅ **Completed** | Manual pause hooks added to Settlement, Group, and Switcher modals. |
| **US-304** | UI Feedback | ✅ **Completed** | Refresh button hidden when auto-sync is active. |

---

**Description:** Currently, Quozen relies on manual user action ("Refresh" button) to synchronize data from Google Drive. This leads to stale data issues in collaborative settings. This initiative introduces a **"Smart Polling"** architecture. The client will lightweight-poll the file's `modifiedTime` metadata every 30 seconds (configurable). Full data synchronization will only trigger when a change is detected on the server.

Crucially, this system implements **"Edit-Safety"**: synchronization is strictly paused whenever the user is engaging in data entry (via Route or Modal) to prevent state conflicts or input loss.

**Success Metrics:**

* **Data Freshness:** Reduce time-to-sync to \< `VITE_POLLING_INTERVAL` (default 30s).  
* **Input Safety:** 0 reported incidents of form data loss due to background refreshes.  
* **Quota Safety:** Zero increase in `403 Rate Limit` errors.

---

## **2\. SCOPE & CONSTRAINTS**

**In-Scope:**

* **Core Logic:** `useAutoSync` hook polling `files.get` (fields=`modifiedTime`).  
* **Configuration:** `VITE_POLLING_INTERVAL` env var (Seconds). 0 \= Disabled (Manual Mode).  
* **Global State:** `AutoSyncContext` to manage `isPaused` state globally.  
* **Route Guards:** Automatic pausing on `/add-expense`, `/edit-expense/*`, `/join/*`.  
* **Modal Guards:** Manual pausing integration in `SettlementModal` and `GroupDialog`.  
* **UI Changes:** Hide "Refresh" button when polling is active.

**Out-of-Scope:**

* Websockets / Push Notifications.  
* Conflict Resolution logic changes (Last Write Wins prevails).

**NFRs:**

* **Battery/Data:** Polling must pause when the tab is not visible (Page Visibility API).  
* **Error Handling:** Polling errors must be silent (console only), no UI toasts.

---

## **3\. USER STORIES**

### **US-301: Smart Polling Infrastructure**

**Narrative:** As a Developer, I want a robust polling engine that respects configuration and tab visibility, so that we sync data efficiently without wasting resources.

**Acceptance Criteria:**

* **Scenario 1 (Configured ON):** * **Given** `VITE_POLLING_INTERVAL=30`.  
  * **Then** the app polls `GET /files/{activeGroupId}?fields=modifiedTime` every 30 seconds.  
  * **And** if `remoteTime > localTime`, it triggers `queryClient.invalidateQueries`.  
* **Scenario 2 (Configured OFF):** * **Given** `VITE_POLLING_INTERVAL=0` (or missing).  
  * **Then** polling is disabled.  
  * **And** the manual "Refresh" button is **visible** in the Header.  
* **Scenario 3 (Background Tab):** * **When** the user switches tabs (document becomes hidden).  
  * **Then** polling pauses immediately.  
  * **When** the user returns.  
  * **Then** polling resumes (optionally triggering an immediate check).

**Dev Notes:**

* Create `src/context/auto-sync-context.tsx`.  
* Use `document.visibilityState`.

---

### **US-302: Route-Based Guard (Edit Safety)**

**Narrative:** As a User on the "Add Expense" page, I want polling to stop, so that a background refresh doesn't reset my form.

**Acceptance Criteria:**

* **Scenario 1 (Unsafe Route):** * **Given** I navigate to `/add-expense` or `/edit-expense/123`.  
  * **Then** the global sync state automatically switches to `PAUSED`.  
  * **And** no metadata calls are made.  
* **Scenario 2 (Safe Route):** * **Given** I navigate back to `/dashboard` or `/expenses`.  
  * **Then** the global sync state switches to `ACTIVE` (unless a modal is open).

**Dev Notes:**

* In `AutoSyncProvider`, listen to `location.pathname`.  
* Define `UNSAFE_ROUTES = ['/add-expense', '/edit-expense', '/join']`.

---

### **US-303: Modal-Based Guard (Interaction Safety)**

**Narrative:** As a User adding a Settlement on the Dashboard, I want polling to pause, so that the underlying list doesn't update and disrupt my modal.

**Acceptance Criteria:**

* **Scenario 1 (Open Modal):** * **Given** I am on the Dashboard (Safe Route).  
  * **When** I click "Settle Up" (Opening `SettlementModal`).  
  * **Then** polling is `PAUSED`.  
* **Scenario 2 (Close Modal):** * **When** I close the modal.  
  * **Then** polling resumes.

**Dev Notes:**

* Expose `setPaused(boolean)` from `useAutoSync()`.  
* Update `SettlementModal` and `GroupDialog` to call `setPaused(true)` on mount and `setPaused(false)` on unmount.

---

### **US-304: UI Feedback & Manual Fallback**

**Narrative:** As a User, I want to know if I need to sync manually, so that I am not confused by the interface.

**Acceptance Criteria:**

* **Scenario 1 (Auto Mode):** * **Given** Polling is enabled (Interval \> 0).  
  * **Then** the "Refresh" button in the Header is **HIDDEN**.  
* **Scenario 2 (Manual Mode):** * **Given** Polling is disabled (Interval \= 0).  
  * **Then** the "Refresh" button is **VISIBLE**.  
  * **And** clicking it triggers the legacy manual sync logic with Toast feedback.

**Dev Notes:**

* Refactor `src/components/header.tsx` to read the config or context state.
