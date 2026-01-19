# User Stories and Plan

# **Quozen Multi-User Support \- Requirements Document**

---

## **Executive Summary**

**Feature:** Multi-User Group Support for Quozen **Version:** 1.0 (V1) **Objective:** Enable multiple Google users to collaborate on shared expense groups while maintaining data consistency and simple UX.

**Core Principle:** Keep it simple \- leverage Google Drive's sharing mechanism, implement manual sync, and prevent data inconsistencies through validation rather than complex conflict resolution.

---

## **1\. Technical Foundation**

### **1.1 Current Architecture Analysis**

**Strengths to Maintain:**

* ✅ Client-side only (no backend)  
* ✅ Google OAuth implicit flow  
* ✅ Direct Google Sheets API usage  
* ✅ Schema already supports multiple members  
* ✅ Expense splits already support multiple users

**Key Improvements Needed:**

* ❌ Loose spreadsheet identification (any spreadsheet appears as group)  
* ❌ No sharing mechanism  
* ❌ No conflict detection  
* ❌ Single-user UI assumptions

### **1.2 Group Identification Strategy**

**Decision:** Use naming convention with structure validation (Option A with safeguards)

**Implementation:**

// Identify Quozen groups by:

1\. Filename starts with "Quozen \- "

2\. File is a spreadsheet (mimeType \= 'application/vnd.google-apps.spreadsheet')

3\. File is not trashed

4\. The query in Google Drive must take into account files shared with the owner that satisfy the above conditions.

//  Encapsulate identification logic in a dedicated function so it makes easier in the future to use a different approach

In the future we may want to use Google Docs file properties instead of relying in user editable strings.

**Query Enhancement:**

// Current (too broad):

const query \= "mimeType \= 'application/vnd.google-apps.spreadsheet' and trashed \= false";

// New (more specific):

const query \= "mimeType \= 'application/vnd.google-apps.spreadsheet' " \+

              "and trashed \= false " \+

              "and name contains 'Quozen \- '";

// For non-owners, add:

"and sharedWithMe \= true"

---

## **2\. User Stories**

### **Epic: Multi-User Group Management**

#### **Story 2.1: Create Group with Members (Owner)**

**As a** group owner  
 **I want to** optionally add member emails when creating a group  
 **So that** I can immediately collaborate with my friends/family on expenses

**Acceptance Criteria:**

* \[ \] Group creation dialog has optional "Members" field (comma-separated emails or usernames)  
* \[ \] Field accepts: `email1@gmail.com, email2@yahoo.com` format  
* \[ \] Whitespace around emails is trimmed  
* \[ \] Empty field creates private (owner-only) group  
* \[ \] Invalid email format shows warning but doesn't block creation (this way a user can create a group and track expenses of a friend that is not willing to use the app or doesn't want to provide an email.  
* \[ \] After group creation:  
  * \[ \] Spreadsheet is created with "Quozen \- \[GroupName\]" format  
  * \[ \] Owner is added to Members tab with role="admin"  
  * \[ \] Each valid member email is added to Members tab with role="member"  
  * \[ \] Spreadsheet is shared (writer permission) with all member emails via Drive API (this applies only for those members that provided a valid email address that can be used with the share feature of Google)  
  * \[ \] Success toast shows: "Group created and shared with \[N\] members"  
  * \[ \] If sharing fails for some emails, show: "Group created. Sharing failed for: \[emails\]"

**Technical Notes:**

// Google Drive sharing API

async function shareSpreadsheet(fileId: string, email: string): Promise\<boolean\> {

  try {

    await gapi.client.drive.permissions.create({

      fileId: fileId,

      requestBody: {

        type: 'user',

        role: 'writer',

        emailAddress: email

      },

      sendNotificationEmail: true // Google sends email notification

    });

    return true;

  } catch (error) {

    console.error(\`Failed to share with ${email}:\`, error); //this is just a stub, it needs improvement to satisfy criteria

    return false;

  }

}

---

#### **Story 2.2: Edit Group Members (Owner)**

**As a** group owner  
 **I want to** add or remove members from an existing group  
 **So that** I can manage who has access as needs change

**Acceptance Criteria:**

* \[ \] Groups page shows "Edit" button only for groups where current user is admin  
* \[ \] Edit button opens same dialog as "Create Group" with fields pre-filled  
* \[ \] Members field shows current comma-separated email list  
* \[ \] Owner can add new emails (comma-separated)  
* \[ \] Owner can remove emails from the list  
* \[ \] Before removing a member:  
  * \[ \] App checks if member has any expenses (as payer or in splits)  
  * \[ \] If yes, show error: "Cannot remove \[name\]. They have \[N\] expenses. Edit/delete those first."  
  * \[ \] Block the save operation  
* \[ \] If no conflicts, on save:  
  * \[ \] Update Members tab (add new rows, delete removed rows)  
  * \[ \] Share spreadsheet with new members  
  * \[ \] Revoke Drive permissions for removed members  
  * \[ \] Show success: "Group updated. \[N\] members added, \[M\] removed."

**UI Mockup:**

┌─────────────────────────────────────┐

│ Edit Group: Holiday Trip            │

├─────────────────────────────────────┤

│ Group Name: \[Holiday Trip        \]  │

│                                     │

│ Members (comma-separated emails):   │

│ ┌─────────────────────────────────┐ │

│ │ alice@gmail.com,                │ │

│ │ bob@yahoo.com,                  │ │

│ │ charlie@gmail.com               │ │

│ └─────────────────────────────────┘ │

│                                     │

│ \[Cancel\]              \[Save Group\]  │

└─────────────────────────────────────┘

---

#### **Story 2.3: Discover Shared Groups (Member)**

**As a** group member (non-owner)  
 **I want to** see groups that have been shared with me  
 **So that** I can access expenses without creating the group myself

**Acceptance Criteria:**

\[ \] On app load, fetch groups from Drive with query:  
 mimeType \= 'application/vnd.google-apps.spreadsheet' and trashed \= false and name contains 'Quozen \- 'and (sharedWithMe \= true or 'me' in owners)

*   
* \[ \] For each file found:  
  * \[ \] Validate it has Members, Expenses, Settlements tabs  
  * \[ \] Read Members tab to find current user's row  
  * \[ \] If user not in Members tab, skip this file (invalid state)  
  * \[ \] If user in Members tab, add to groups list  
* \[ \] Groups page displays all valid groups (owned \+ shared)  
* \[ \] Each group card shows:  
  * \[ \] Group name (stripped of "Quozen \- " prefix)  
  * \[ \] Badge: "Owner" (if role=admin) or "Member" (if role=member)  
  * \[ \] "Active" badge if it's the currently selected group  
  * \[ \] "Switch To" button if not active

**Edge Case Handling:**

* Spreadsheet shared but user not in Members tab → Skip (corrupted state)  
* User in Members tab but spreadsheet not shared → Show error on access attempt  
* Spreadsheet structure invalid (missing tabs/columns) → Skip with console warning

---

#### **Story 2.4: Delete Group (Owner Only)**

**As a** group owner  
 **I want to** delete a group I created  
 **So that** I can remove old/unused groups

**Acceptance Criteria:**

* \[ \] Delete button visible only on groups where current user is admin

\[ \] Clicking "Delete" shows confirmation dialog:  
 ┌─────────────────────────────────────┐│ Delete Group?                       │├─────────────────────────────────────┤│ This will permanently delete the    ││ "Holiday Trip" spreadsheet from     ││ Google Drive. All members will lose ││ access. This cannot be undone.      ││                                     ││ \[Cancel\]          \[Delete Group\]    │└─────────────────────────────────────┘

*   
* \[ \] On confirm:  
  * \[ \] Call Drive API to trash the file: `gapi.client.drive.files.delete({fileId})`  
  * \[ \] Remove from local group list  
  * \[ \] If it was active group, switch to first available group or show "no groups" state  
  * \[ \] Show toast: "Group deleted successfully"

---

#### **Story 2.5: Leave Group (Member Only)**

**As a** group member (non-owner)  
 **I want to** leave a group I'm part of  
 **So that** I can stop seeing groups I'm no longer involved with

**Acceptance Criteria:**

* \[ \] "Leave Group" button visible only for groups where current user is NOT admin  
* \[ \] Before leaving:  
  * \[ \] Check if user has any expenses (as payer or in splits)  
  * \[ \] If yes, show error: "You have \[N\] expenses in this group. Ask the owner to edit/delete them first."  
  * \[ \] Block leave operation

\[ \] If no conflicts, show confirmation:  
 ┌─────────────────────────────────────┐│ Leave Group?                        │├─────────────────────────────────────┤│ You will no longer see "Holiday     ││ Trip" in your groups list. The      ││ owner can re-add you later.         ││                                     ││ \[Cancel\]            \[Leave Group\]   │└─────────────────────────────────────┘

*   
* \[ \] On confirm:  
  * \[ \] Remove user's row from Members tab  
  * \[ \] Revoke user's Drive permission (owner should do this, but member can remove themselves)  
  * \[ \] Remove from local group list  
  * \[ \] Show toast: "You've left the group"

**Technical Note:** Member can't actually revoke their own Drive permission, but removing from Members tab is sufficient. Owner will see member gone on next refresh.

---

### **Epic: Conflict Detection & Manual Sync**

#### **Story 2.6: Manual Refresh Button**

**As a** user  
 **I want to** manually refresh group data  
 **So that** I can see updates made by other members

**Acceptance Criteria:**

* \[ \] Global "Refresh" button in top-right corner of every page (next to group selector)  
* \[ \] Button shows sync icon (rotating arrows)  
* \[ \] On click:  
  * \[ \] Show loading state (spinning icon)  
  * \[ \] Re-fetch entire group data from Sheets API  
  * \[ \] Update all cached data (expenses, settlements, members)  
  * \[ \] Update UI with fresh data  
  * \[ \] Show toast: "Data refreshed"  
  * \[ \] If fetch fails, show error: "Failed to refresh. Check your connection."  
* \[ \] Button always visible (Dashboard, Expenses, Groups, Profile pages)

**UI Location:**

┌─────────────────────────────────────┐

│ ☰  Holiday Trip  🔄 Refresh  ⚙️     │ ← Header

├─────────────────────────────────────┤

│                                     │

│   (Page Content)                    │

---

#### **Story 2.7: Edit Conflict Detection**

**As a** user  
 **I want to** be notified if my edit conflicts with another user's recent change  
 **So that** I don't accidentally overwrite their work

**Acceptance Criteria:**

* \[ \] When user clicks "Save" on an expense edit:  
  * \[ \] Before writing to Sheets, re-fetch that specific expense row  
  * \[ \] Compare fetched data with what user is editing

\[ \] If different (someone else edited it), show error:  
 ┌─────────────────────────────────────┐│ Edit Conflict Detected              │├─────────────────────────────────────┤│ This expense was modified by        ││ another user. Please refresh and    ││ try again.                          ││                                     ││ \[Refresh Data\]        \[Cancel\]      │└─────────────────────────────────────┘

*   
  * \[ \] "Refresh Data" button reloads expense list and returns to Expenses page  
  * \[ \] User must re-enter edit mode to retry  
* \[ \] If no conflict, save proceeds normally  
* \[ \] Same logic applies to:  
  * \[ \] Deleting an expense (check if it still exists)  
  * \[ \] Editing settlements  
  * \[ \] Deleting settlements

**Technical Implementation:**

async function updateExpenseWithConflictCheck(

  groupId: string,

  expense: Expense,

  rowIndex: number

): Promise\<void\> {

  // 1\. Fetch current state

  const currentExpense \= await googleApi.getExpenseByRowIndex(groupId, rowIndex);


  // 2\. Check if modified (compare timestamp or hash)

  if (currentExpense.meta?.lastModified \!== expense.meta?.lastModified) {

    throw new ConflictError("Expense modified by another user");

  }


  // 3\. Proceed with update

  await googleApi.updateRow(groupId, "Expenses", rowIndex, {

    ...expense,

    meta: {

      ...expense.meta,

      lastModified: new Date().toISOString()

    }

  });

}

**Metadata Addition:** Add `lastModified` to expense metadata:

// When creating expense

meta: {

  createdAt: new Date().toISOString(),

  lastModified: new Date().toISOString()

}

// When updating expense

meta: {

  ...existing.meta,

  lastModified: new Date().toISOString()

}

---

#### **Story 2.8: Delete Conflict Handling**

**As a** user  
 **I want to** be prevented from editing an expense that another user just deleted  
 **So that** I don't get confusing errors

**Acceptance Criteria:**

* \[ \] When user navigates to Edit Expense page:  
  * \[ \] Fetch expense by ID from current cached data

\[ \] If expense not found in cache, show error:  
 ┌─────────────────────────────────────┐│ Expense Not Found                   │├─────────────────────────────────────┤│ This expense may have been deleted. ││ Please refresh to see latest data.  ││                                     ││ \[Refresh & Go Back\]                 │└─────────────────────────────────────┘

*   
  * \[ \] Redirect to Expenses page after refresh  
* \[ \] When user tries to save edit:  
  * \[ \] Re-fetch expense before saving  
  * \[ \] If not found (deleted by another user), show same error as above  
  * \[ \] Cancel save operation

---

### **Epic: Multi-User Expense Management**

#### **Story 2.9: Add Expense with Multiple Members**

**As a** user  
 **I want to** split an expense among multiple group members  
 **So that** we can fairly divide costs

**Acceptance Criteria:**

* \[ \] Add Expense page shows all members from Members tab in "Split Between" section  
* \[ \] Each member has:  
  * \[ \] Checkbox (default: all selected)  
  * \[ \] Avatar circle with initials  
  * \[ \] Name label ("You" for current user, actual name for others)  
  * \[ \] Amount input field  
* \[ \] "Select All" / "Deselect All" button toggles all checkboxes  
* \[ \] When amount changes or members selected/deselected:  
  * \[ \] Auto-calculate equal split among selected members  
  * \[ \] Update each member's amount input  
* \[ \] User can manually adjust individual amounts  
* \[ \] Before submit:  
  * \[ \] Validate: Sum of splits must equal total expense amount (±$0.02 tolerance)  
  * \[ \] Validate: At least one member must be selected  
  * \[ \] If validation fails, show inline error under split section  
* \[ \] On successful submit:  
  * \[ \] Write expense to Expenses tab with splits array  
  * \[ \] Update balances (this already works)  
  * \[ \] Show toast: "Expense added and split among \[N\] members"

**Enhanced Split UI:**

Split Between                     \[Select All\]

┌─────────────────────────────────────┐

│ ☑ 👤 You                   $16.67   │

│ ☑ 👤 Alice Smith          $16.67   │

│ ☑ 👤 Bob Johnson          $16.66   │

└─────────────────────────────────────┘

Total: $50.00  Split: $50.00 ✓

---

#### **Story 2.10: View Other Members' Expenses**

**As a** user  
 **I want to** see who paid for each expense  
 **So that** I know what I owe and to whom

**Acceptance Criteria:**

* \[ \] Dashboard and Expenses pages show:  
  * \[ \] "Paid by You" (green) if current user is payer  
  * \[ \] "Paid by \[Name\]" if another member is payer  
  * \[ \] "You owe $X" (red) if current user is in splits but didn't pay  
  * \[ \] "You're owed $X" (green) if current user paid but others are in splits  
* \[ \] Group Balances section  (in the Home page) shows each member with:  
  * \[ \] Name and email  
  * \[ \] Balance (positive \= owed to them, negative \= they owe)  
  * \[ \] "Settle" button to create settlement

**Balance Calculation (Existing Logic \- Ensure it Works):**

// Already implemented in dashboard.tsx

// Just needs to work with multiple members

const balances \= useMemo(() \=\> {

  const bal: Record\<string, number\> \= {};

  users.forEach(u \=\> bal\[u.userId\] \= 0);

  expenses.forEach(expense \=\> {

    bal\[expense.paidBy\] \+= expense.amount;

    expense.splits.forEach(split \=\> {

      bal\[split.userId\] \-= split.amount;

    });

  });

  settlements.forEach(settlement \=\> {

    bal\[settlement.fromUserId\] \+= settlement.amount;

    bal\[settlement.toUserId\] \-= settlement.amount;

  });

  return bal;

}, \[expenses, settlements, users\]);

---

**Note for AI Agent:** Please create a comprehensive implementation plan with all tasks needed and a project tracker section, and write it as an MD file in the repo. Work through these tasks sequentially. After completing each task, mark it as ✅ Completed and update the progress tracker in the implementation plan and commit changes to the feature branch. You can complete several tasks but you must wait for the user to accept your user story as completed before moving to the next one. If you encounter issues, document them in a "Notes" section under that task before proceeding. Ask for clarification if any requirement is ambiguous.

