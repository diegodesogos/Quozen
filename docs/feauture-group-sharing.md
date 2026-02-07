# Feature Group Sharing

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

* **Scenario 1 (Open Modal):**  
  * **Given** I am on the Dashboard or Groups page.  
  * **When** I click the "Share" icon on a group I own.  
  * **Then** a modal opens showing the existing "Add by email" field AND a new "General Access" section.  
* **Scenario 2 (Toggle Public Access):**  
  * **Given** the group is currently "Restricted" (default).  
  * **When** I switch the toggle to "Anyone with the link".  
  * **Then** the app calls the Drive API to set `role: writer, type: anyone`.  
  * **And** the "Copy Link" button becomes enabled/primary.  
* **Scenario 3 (Copy Link):**  
  * **When** I click "Copy Link".  
  * **Then** `https://[app-url]/join/[spreadsheetId]` is copied to my clipboard.  
  * **And** a toast confirms "Link copied".

**Dev Notes:**

* Use `navigator.clipboard.writeText`.  
* The link format must be absolute (e.g., `window.location.origin + "/join/" + id`).

---

### **US-102: Storage Adapter Update (Permissions)**

**Narrative:** As a Developer, I want a dedicated method to handle file permissions, So that I don't accidentally break the existing email-sharing logic.

**Acceptance Criteria:**

* **Scenario 1 (Set Public):**  
  * **When** `setFilePermissions(fileId, 'public')` is called.  
  * **Then** it makes a POST to `drive/v3/files/{fileId}/permissions` with `{ role: 'writer', type: 'anyone' }`.  
* **Scenario 2 (Set Restricted):**  
  * **When** `setFilePermissions(fileId, 'restricted')` is called.  
  * **Then** it first lists existing permissions to find the one where `type === 'anyone'`.  
  * **And** calls DELETE on that specific permission ID.

**Dev Notes:**

* Do *not* overload the existing `shareFile` method. Create a distinct `setFilePermissions` method in `src/lib/storage/google-drive-adapter.ts`.  
* Handle 404s gracefully (if file doesn't exist).

---

### **US-103: Deep Link Route & Auth Guard**

**Narrative:** As a potential member, I want to click an invite link and be guided to login, So that I can securely access the group.

**Acceptance Criteria:**

* **Scenario 1 (Unauthenticated User):**  
  * **Given** I am not logged in.  
  * **When** I visit `/join/12345`.  
  * **Then** I am redirected to `/login`.  
  * **And** the target group ID (`12345`) is stored (e.g., in `location.state` or `sessionStorage`) to be resumed after login.  
* **Scenario 2 (Authenticated User):**  
  * **Given** I am logged in.  
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

* **Scenario 1 (New Member):**  
  * **Given** I am authenticated and have clicked the join link.  
  * **When** the page loads.  
  * **Then** the app fetches the spreadsheet metadata (to confirm existence and get the Name).  
  * **And** checks if I am already in the `Members` tab.  
  * **And** if not, calls `appendRow` on the "Members" sheet with my `userId`, `email`, `name`, and `role: "member"`.  
  * **And** adds the group to my `quozen-settings.json`.  
  * **And** redirects me to the Dashboard for that group.  
* **Scenario 2 (Already Member):**  
  * **Given** I am already in the group.  
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

* **Scenario 1 (Success Flow):**  
  * **Given** I just successfully created a group via the "New Group" dialog.  
  * **When** the creation success toast appears.  
  * **Then** a new Dialog appears: "Group Created\! Invite others?".  
  * **And** it displays the Share options (defined in US-101).

**Dev Notes:**

* Modify `src/pages/groups.tsx`.  
* Trigger the "Share Modal" state upon success of the `createGroupMutation`.

