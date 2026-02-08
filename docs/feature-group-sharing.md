# Feature Group Sharing

## **Implementation Status**

| ID | Title | Status | Notes |
| :--- | :--- | :--- | :--- |
| **US-101** | Share Group Modal & Logic | ✅ **Completed** | Implemented `ShareDialog` with permission toggle and copy link. |
| **US-102** | Storage Adapter Update | ✅ **Completed** | Added `setFilePermissions` to Adapter and `joinGroup` logic to Service. |
| **US-103** | Deep Link Route & Auth | ✅ **Completed** | Added `/join/:id` route, `JoinPage`, and login redirection handling. |
| **US-104** | Join Logic | ✅ **Completed** | Implemented atomic `appendRow` for members and local settings sync. |
| **US-105** | Post-Creation Prompt | ✅ **Completed** | `createGroupMutation` now triggers `ShareDialog` on success. |
| **US-201** | Metadata Stamping on Creation | ✅ **Completed** | Groups created are now stamped with `quozen_type: 'group'`. |
| **US-202** | Strict Reconciliation (Metadata Scan) | ✅ **Completed** | `reconcileGroups` now strictly filters by metadata properties. |
| **US-203** | Manual Import & Validation (The "Blessing" Flow) | ✅ **Completed** | Import validates legacy files and stamps them if valid. |
| **US-204** | Join via Link (Metadata Guard) | ✅ **Completed** | Join link checks metadata before attempting to write to sheet. |

IMPORTANT: For all stories make sure i18n is used for all strings, add any new missing keys to the i18n files.

---

# Implementation Requirements

**Title:** Expense Group Share Improvements ("Magic Link")

**Description:** Currently, inviting users to a Quozen group requires knowing their email address or asking them to manually navigate the Google Picker to find a specific spreadsheet. This high cognitive load hinders growth and adoption.

This Epic introduces a "Magic Link" sharing flow similar to Google Docs or Notion. Group owners can generate a unique URL (e.g., `quozen.app/join/{id}`) that temporarily opens the file to "Anyone with the link". When a new user clicks this link, the app authenticates them, appends them to the group roster, and redirects them to the dashboard—all without manual file navigation.

**Success Metrics:**

* **Viral Coefficient:** Increase in the average number of members per group.  
* **Conversion Rate:** % of users who click a "Join" link and successfully land on the Group Dashboard.  
* **Time-to-Value:** Reduction in time from "Invite Sent" to "Member Added" (measured qualitatively or via funnel duration).

---

# **2\. SCOPE & CONSTRAINTS**

**In-Scope:**

* **UI:** New "Share Group" modal with "Copy Link" and permission toggle.  
* **Routing:** New `/join/:spreadsheetId` route.  
* **Auth:** Enforced Google Sign-In for all joiners (no anonymous access).  
* **Storage Layer:** New `setFilePermissions` method in `GoogleDriveAdapter` to handle public/restricted toggling.  
* **Data Integrity:** Use of `appendRow` for adding members to minimize race conditions.

**Out-of-Scope:**

* **Automatic Reverting:** The system will *not* automatically revert permissions to "Restricted" after a join (due to race conditions). The owner must manually toggle it off, similar to Google Docs.  
* **Anonymous Viewing:** Users cannot view group details (name, members) without logging in first.  
* **Social Previews:** Generating `og:image` or metadata for the link (requires server-side rendering or edge functions, which Quozen's client-side architecture does not natively support).

**Technical Dependencies:**

* Google Drive API v3 (`permissions.create`, `permissions.delete`).  
* Existing `AuthProvider` for session handling.

**Non-Functional Requirements (NFRs):**

* **Security:** Access tokens must never be exposed in the URL. The `spreadsheetId` is the only public identifier.  
* **Concurrency:** The "Join" action must use atomic append operations (`appendRow`) to prevent overwriting other concurrent joiners.  
* **Feedback:** UI must clearly indicate when permissions are being modified (e.g., "Making group public...").

---

# **3\. USER STORIES**

### **US-101: Share Group Modal & Logic**

**Narrative:** As a Group Owner, I want to toggle "Link Sharing" and copy a magic link, So that I can invite friends via WhatsApp or Signal without asking for their emails first.

**Acceptance Criteria:**

* **Scenario 1 (Open Modal):** * **Given** I am on the Dashboard or Groups page.  
  * **When** I click the "Share" icon on a group I own.  
  * **Then** a modal opens showing the existing "Add by email" field AND a new "General Access" section.  
* **Scenario 2 (Toggle Public Access):** * **Given** the group is currently "Restricted" (default).  
  * **When** I switch the toggle to "Anyone with the link".  
  * **Then** the app calls the Drive API to set `role: writer, type: anyone`.  
  * **And** the "Copy Link" button becomes enabled/primary.  
* **Scenario 3 (Copy Link):** * **When** I click "Copy Link".  
  * **Then** `https://[app-url]/join/[spreadsheetId]` is copied to my clipboard.  
  * **And** a toast confirms "Link copied".

**Dev Notes:**

* Use `navigator.clipboard.writeText`.  
* The link format must be absolute (e.g., `window.location.origin + "/join/" + id`).

---

### **US-102: Storage Adapter Update (Permissions)**

**Narrative:** As a Developer, I want a dedicated method to handle file permissions, So that I don't accidentally break the existing email-sharing logic.

**Acceptance Criteria:**

* **Scenario 1 (Set Public):** * **When** `setFilePermissions(fileId, 'public')` is called.  
  * **Then** it makes a POST to `drive/v3/files/{fileId}/permissions` with `{ role: 'writer', type: 'anyone' }`.  
* **Scenario 2 (Set Restricted):** * **When** `setFilePermissions(fileId, 'restricted')` is called.  
  * **Then** it first lists existing permissions to find the one where `type === 'anyone'`.  
  * **And** calls DELETE on that specific permission ID.

**Dev Notes:**

* Do *not* overload the existing `shareFile` method. Create a distinct `setFilePermissions` method in `src/lib/storage/google-drive-adapter.ts`.  
* Handle 404s gracefully (if file doesn't exist).

---

### **US-103: Deep Link Route & Auth Guard**

**Narrative:** As a potential member, I want to click an invite link and be guided to login, So that I can securely access the group.

**Acceptance Criteria:**

* **Scenario 1 (Unauthenticated User):** * **Given** I am not logged in.  
  * **When** I visit `/join/12345`.  
  * **Then** I am redirected to `/login`.  
  * **And** the target group ID (`12345`) is stored (e.g., in `location.state` or `sessionStorage`) to be resumed after login.  
* **Scenario 2 (Authenticated User):** * **Given** I am logged in.  
  * **When** I visit `/join/12345`.  
  * **Then** I see a loading screen ("Joining Group...").  
  * **And** the system proceeds to US-104 (Join Logic).

**Dev Notes:**

* Update `src/App.tsx` routes.  
* Create a new page component `src/pages/join.tsx`.  
* Ensure the `Login` page handles the `from` state correctly to redirect back to `/join/...` instead of `/dashboard`.

---

### **US-104: Join Logic (Append Member)**

**Narrative:** As a User, I want to be added to the group list automatically when I join, So that my expenses are tracked correctly.

**Acceptance Criteria:**

* **Scenario 1 (New Member):** * **Given** I am authenticated and have clicked the join link.  
  * **When** the page loads.  
  * **Then** the app fetches the spreadsheet metadata (to confirm existence and get the Name).  
  * **And** checks if I am already in the `Members` tab.  
  * **And** if not, calls `appendRow` on the "Members" sheet with my `userId`, `email`, `name`, and `role: "member"`.  
  * **And** adds the group to my `quozen-settings.json`.  
  * **And** redirects me to the Dashboard for that group.  
* **Scenario 2 (Already Member):** * **Given** I am already in the group.  
  * **When** I visit the join link.  
  * **Then** the app detects my ID in the `Members` list.  
  * **And** immediately redirects me to the Dashboard without writing to the sheet.

**Dev Notes:**

* **Critical:** Use `adapter.appendRow` directly. Do *not* use `updateGroup` (which reads/writes the whole array), as this causes race conditions if multiple people join simultaneously.  
* Role must hardcode to `"member"`.

---

### **US-105: Post-Creation Prompt**

**Narrative:** As a Group Creator, I want to be prompted to share immediately after creating a group, So that I don't have to hunt for the button.

**Acceptance Criteria:**

* **Scenario 1 (Success Flow):** * **Given** I just successfully created a group via the "New Group" dialog.  
  * **When** the creation success toast appears.  
  * **Then** a new Dialog appears: "Group Created\! Invite others?".  
  * **And** it displays the Share options (defined in US-101).

**Dev Notes:**

* Modify `src/pages/groups.tsx`.  
* Trigger the "Share Modal" state upon success of the `createGroupMutation`.



# **Epic Extension: Robust File Discovery & Validation**

**Epic:** Data Integrity & Discovery Refactor **Status:** ✅ **Completed**

**Description:** Currently, the application relies on filename prefixes (`Quozen - ...`) to discover and sync groups. This leads to "ghost" groups (corrupted files) appearing in the dashboard and prevents users from renaming their files freely.

We will transition to a **Metadata-First** architecture using Google Drive `properties`. We will strictly trust files stamped with Quozen metadata. To support legacy files or external imports, the Manual Import flow will perform deep structure validation and "bless" valid files by applying the missing metadata.

**Success Metrics:**

* **Error Reduction:** 0 reports of "Invalid Content" errors appearing in the Dashboard list (since invalid files won't be imported).  
* **Discovery Accuracy:** 100% of valid Quozen groups are found via "Reconcile" regardless of their filename.  
* **Migration Rate:** % of legacy groups successfully migrated (stamped) via the Manual Import flow.

---

## **2\. SCOPE & CONSTRAINTS (Extension)**

**In-Scope:**

* **Storage Layer:** Updating `GoogleDriveAdapter` to read/write custom file properties.  
* **Creation:** Adding metadata stamp during `createGroupSheet`.  
* **Reconciliation:** Updating the search query to filter by `properties`.  
* **Import Logic:** Implementing a `validateAndStamp` routine for the Google Picker callback.  
* **Join Logic:** Updating `joinGroup` to check metadata before writing member data.

**Out-of-Scope:**

* **Batch Migration:** We will not run a background script to migrate all files at once. Migration happens lazily via Manual Import or whenever a user interacts with a legacy file successfully.

**Technical Dependencies:**

* Google Drive API v3 `files.update` (for adding properties).  
* Google Sheets API v4 (for validating structure).

**Non-Functional Requirements:**

* **Performance:** Metadata checks (`files.get`) are significantly faster than reading spreadsheet values (`spreadsheets.values.get`). This should improve the speed of the "Join" flow.  
* **Visibility:** Properties must be set to `PUBLIC` visibility so that when User A shares a file with User B, User B's app instance can see the metadata.

---

## **3\. USER STORIES**

### **US-201: Metadata Stamping on Creation**

**Narrative:** As a System, I want to tag all newly created groups with specific metadata, So that they can be unambiguously identified as Quozen files regardless of their filename.

**Acceptance Criteria:**

* **Scenario 1 (Create Group):** * **When** `createGroupSheet` is called.  
  * **Then** the Drive API creation request includes `properties: { 'quozen_type': 'group', 'version': '1.0' }`.  
* **Scenario 2 (Verify):** * **When** I inspect the file via API.  
  * **Then** the properties are visible.

**Dev Notes:**

* Use the `properties` field (not `appProperties`) to ensure visibility across different user accounts sharing the file.  
* Key: `quozen_type`, Value: `group`.

---

### **US-202: Strict Reconciliation (Metadata Scan)**

**Narrative:** As a User, I want the "Scan for missing groups" feature to only import valid Quozen groups, So that my dashboard isn't cluttered with corrupted or unrelated spreadsheets.

**Acceptance Criteria:**

* **Scenario 1 (Scanning):** * **Given** I have a file named "Quozen \- Random Excel" (invalid) and "My Budget" (Valid Quozen Group with metadata).  
  * **When** I trigger "Reconcile Groups".  
  * **Then** the system queries Drive for `properties has { key='quozen_type' and value='group' }` (and `trashed=false`).  
  * **And** "My Budget" is added to the list.  
  * **And** "Quozen \- Random Excel" is IGNORED completely.  
* **Scenario 2 (Missing Settings Reconstruction):** * **Given** `quozen-settings.json` is missing.  
  * **When** the app reconstructs the settings.  
  * **Then** it uses the same metadata-based query.

**Dev Notes:**

* Update `src/lib/storage/google-drive-adapter.ts` method `listFiles`.  
* New Query format: `properties has { key='quozen_type' and value='group' } and trashed = false`.  
* Remove the `name contains 'Quozen - '` filter.

---

### **US-203: Manual Import & Validation (The "Blessing" Flow)**

**Narrative:** As a User, I want to manually select a spreadsheet via the Google Picker, have it validated, and automatically fixed (tagged) if it's a valid Quozen group, So that I can restore access to older files or renamed files.

**Acceptance Criteria:**

* **Scenario 1 (Import Legacy/Unstamped File):** * **Given** I select a spreadsheet via Google Picker that has the correct tabs ("Expenses", "Members") but NO metadata.  
  * **When** the app processes the selection.  
  * **Then** it fetches the spreadsheet structure (sheet titles and header rows).  
  * **If** structure matches the schema:  
    * The app calls `files.update` to add `quozen_type: 'group'`.  
    * The group is added to the user's settings cache.  
    * Success toast: "Group imported and verified."  
* **Scenario 2 (Import Invalid File):** * **Given** I select a random spreadsheet.  
  * **When** the structure check fails (missing "Expenses" tab).  
  * **Then** the app shows an error: "Invalid Quozen Group. Missing required sheets."  
  * **And** NO metadata is added to the file.

**Dev Notes:**

* Modify `src/lib/storage/storage-service.ts`:  
  * Create `validateAndStampGroup(fileId)` method.  
  * Validation logic:  
    1. Check if tabs `Expenses`, `Settlements`, `Members` exist.  
    2. (Optional but recommended) Check if A1 cell on each matches expected headers.  
  * If valid: call `adapter.addFileProperties(fileId, { quozen_type: 'group' })`.

---

### **US-204: Join via Link (Metadata Guard)**

**Narrative:** As a User clicking an invite link, I want the system to quickly verify the file is a valid group before attempting to join, So that I get immediate feedback if the link is bad.

**Acceptance Criteria:**

* **Scenario 1 (Valid Join):** * **When** I visit `/join/:id`.  
  * **Then** the app fetches file metadata first.  
  * **If** property `quozen_type === 'group'` exists \-\> Proceed to add member logic.  
* **Scenario 2 (Invalid Target):** * **When** I visit a link to a non-Quozen file.  
  * **Then** the app sees missing metadata.  
  * **And** halts execution with error: "This file is not a valid Quozen Group." (Does not attempt to write to the sheet).

**Dev Notes:**

* This prevents the app from accidentally writing "Member" rows into a random spreadsheet that a user might have pasted the ID for.
