# Progress Tracking

| ID | Feature / Bug Fix | Status |
|---|---|---|
| Bug-01 | Precision error in payments (< 0.5) | ✅ Completed |
| 1 | Universal Bottom Drawer Strategy | ✅ Completed |
| 2 | Sticky Action Footers | ✅ Completed |
| 3 | Standardize Navigation Header Pattern | ✅ Completed |
| 4 | Expand Group Card Touch Target | ✅ Completed |
| 5 | Consolidate Secondary Actions (Meatball Menu) | ✅ Completed |
| 6 | Enforce Mobile-Safe Input Sizing | ✅ Completed |
| 7 | Convert "Split Between" to Tappable List Items | ✅ Completed |
| 8 | Smart "Members" Input | ✅ Completed |
| 9 | Implement Segmented Controls for Views | ✅ Completed |
| 10 | Empty State Illustration | ✅ Completed |
| 11 | Haptic Feedback Integration | ✅ Completed |
| 12 | Redesign Dashboard "Settle Up" CTA | ✅ Completed |
| 13 | Refactor "Group Balances" Rows | ✅ Completed |
| 14 | Streamline Settlement Modal (Directional UI) | ✅ Completed |
| 15 | Quick Actions for Transfer History | ✅ Completed |
| 16 | Remove Legacy Registration Route | ✅ Completed |
| 17 | Implement Mobile "Cover" Login Layout | ✅ Completed |
| 18 | "Wizard" UI for Manual Join Fix | ✅ Completed |
| 19 | Convert Expense Forms to Drawers | ✅ Completed |
| 20 | Refactor Group Switcher (Navigation Only) | ⬜ Todo|
| 21 | Enhanced Groups Page (Management Hub)| ⬜ Todo| 
| 22 | Empty State Guidance (Groups)|⬜ Todo|

# Bugs

#### Bug-01

Error attempting to pay 0.5 and lower, precision is set to 50 cents instead of 5 cents.  
If you attempt a transfer amount lower than 0.5, the app records a 0.0 transaction and balance remains the same before the transfer.

## UX/UI Improvements

### Phase 1: Architecture & Navigation (The Framework)

**1\. Implement Universal Bottom Drawer Strategy**

* **Target Components:** `GroupDialog`, `ShareDialog`, `SettlementModal`, `GroupSwitcherModal`.  
* **Instruction:** Replace all instances of `Dialog` (Radix UI) with `Drawer` (Vaul) for operational tasks.  
  * **Behavior:** The modal must slide up from the bottom, covering roughly 85-90% of the screen (or auto-height).  
  * **Dismissal:** Enable "pull-down to dismiss" gesture.  
  * **Handle:** Ensure the visible "drag handle" pill is present at the top of the drawer content.

**2\. Implement Sticky Action Footers (Z-Index Fixed)**

* **Target Screens:** `Add Expense`, `Edit Expense`, `New Group`.  
* **Instruction:** Remove the "Save/Cancel" buttons from the scrollable document flow.  
  * **Implementation:** Place them in a fixed container (`position: fixed; bottom: 0; width: 100%`) with a solid background (`bg-background`) and a top border/shadow (`border-t`).  
  * **Padding:** Add `pb-24` (padding-bottom) to the main content container so the last form fields aren't hidden behind the sticky footer.

**3\. Standardize Navigation Header Pattern**

* **Target Screens:** All sub-pages (`/add-expense`, `/group/*`, `/profile`).  
* **Instruction:** Replace custom "Cancel" buttons in the top-right or bottom with a standardized **"Back Arrow"** icon button in the top-left of the `Header`.  
  * **Visual:** `ChevronLeft` icon, `ghost` variant.  
  * **Behavior:** `Maps(-1)` (History Back).

---

### Phase 2: The Groups Page Refactor (High Interaction Volume)

**4\. Expand Group Card Touch Target ("The Big Switch")**

* **Target:** `src/pages/groups.tsx` \-\> `Card` component loop.  
* **Instruction:** Convert the entire surface of the `Card` into the primary trigger for "Switch Group".  
  * **Action:** Remove the `Button` labeled "Switch To".  
  * **Feedback:** When the active group is rendered, apply a visual indicator (e.g., a colored ring `ring-2 ring-primary` or a "Current" badge) instead of a disabled button.

**5\. Consolidate Secondary Actions (Meatball Menu)**

* **Target:** `src/pages/groups.tsx` \-\> Action Buttons (`Edit`, `Share`, `Delete`, `Leave`).  
* **Instruction:** Remove the cluster of icon buttons.  
  * **Implementation:** Introduce a single `MoreVertical` (Ellipsis) icon button aligned to the top-right of the card content.  
  * **Interaction:** Tapping this opens a `DropdownMenu` (or `Drawer` context menu) containing the options: "Share Group", "Edit Group", and "Delete Group" (destructive, red text).

---

### Phase 3: Form Ergonomics & Data Entry

**6\. Enforce Mobile-Safe Input Sizing**

* **Target:** Global CSS / Tailwind Config.  
* **Instruction:** Set the font-size of all `input`, `select`, and `textarea` elements to **16px** (rem equivalent) for viewports under 768px.  
  * **Reason:** Prevents iOS Safari from auto-zooming into the input field on focus.

**7\. Convert "Split Between" to Tappable List Items**

* **Target:** `src/components/expense-form.tsx`.  
* **Instruction:** Refactor the checkbox rows.  
  * **Hit Area:** The click event `onClick` must be bound to the entire *Row Container* (`div`), not just the `Checkbox` element.  
  * **Visual State:** When selected, the entire row background should change (e.g., to `bg-primary/10`) to provide immediate visual confirmation.

**8\. Smart "Members" Input**

* **Target:** `GroupDialog` (now `Drawer`).  
* **Instruction:** Replace the `Textarea` for member emails with a "Chip Input" or "Multi-line List".  
  * **Interaction:** \[ Input Field \] \[ Add Button \].  
  * **Display:** Added members appear as a list of removable chips/badges below the input. This avoids comma-separated string parsing errors on mobile keyboards.

---

### Phase 4: Visual Consistency & Theme

**9\. Implement Segmented Controls for Views**

* **Target:** `src/pages/activity-hub.tsx`.  
* **Instruction:** Replace the `Switch` component (used for "Me vs All") with a **Segmented Control** pattern.  
  * **Component:** Use `Tabs` with `TabsList` width set to `w-full` and `TabsTrigger` set to `flex-1`.  
  * **Labels:** "My Activity" | "All Activity".

**10\. Empty State Illustration**

* **Target:** `Groups`, `Expenses`.  
* **Instruction:** Replace plain text "No groups yet" with a rich empty state.  
  * **Assets:** Use a large Lucide icon (e.g., `Layers` or `Receipt`) sized `w-16 h-16`, styled with `text-muted-foreground/20` (very faint).  
  * **Layout:** Center vertically and horizontally. Add a clear CTA button immediately below it ("Create Group").

**11\. Haptic Feedback Integration**

* **Target:** `ExpenseForm` (Submit), `SettlementModal` (Submit).  
* **Instruction:** Invoke `navigator.vibrate(50)` (success bump) upon successful mutation completion to give physical confirmation of the financial transaction.

### Phase 5: Settlement & Transaction Flows

**12\. Redesign Dashboard "Settle Up" CTA**

* **Target:** `src/pages/dashboard.tsx` (Balance Card).  
* **Instruction:**  
  * **Logic:** If `userBalance < 0` (I owe money), promote the "Settle Up" button to a **Primary Action** (Solid Color) below the balance amount, spanning full width.  
  * **Label:** Change from "Settle Up" to **"Pay Debt"** (if owing) or **"Request Settlement"** (if owed). Explicit verbs reduce anxiety.

**13\. Refactor "Group Balances" Rows**

* **Target:** `src/pages/dashboard.tsx` (Collapsible List).  
* **Instruction:**  
  * **Remove:** The small "Settle" text link.  
  * **Add:** A dedicated **Action Button** (size `sm`, `outline`) on the right side of the row.  
  * **Iconography:** Use `Banknote` or `HandCoins`.  
  * **Touch Target:** Ensure the button has at least 44px height hit area (even if visually smaller).

**14\. Streamline Settlement Modal (Directional UI)**

* **Target:** `src/components/settlement-modal.tsx` (Convert to `Drawer`).  
* **Instruction:** Redesign the Payer/Receiver selection.  
  * **Visual:** Display two large Avatar/Name blocks connected by an **Arrow Button**.  
  * **Interaction:** Tapping the Arrow swaps the Payer and Receiver. This is faster than using dropdowns.  
  * **Reasoning:** In 99% of cases, the settlement is between "Me" and "You". The dropdown is overkill; a swap button is efficient.

**15\. Quick Actions for Transfer History**

* **Target:** `src/pages/activity-hub.tsx` (Transfer Cards).  
* **Instruction:** Add a **Meatball Menu** (`MoreVertical`) to each Transfer Card.  
  * **Options:** "Edit Details", "Delete Record" (Destructive).  
  * **Benefit:** Allows deleting a wrong entry without opening the full edit form.

### Phase 6: Auth & Onboarding Refactor

**16\. Remove Legacy Registration Route**

* **Target:** `src/pages/login.tsx`, `src/App.tsx`.  
* **Instruction:**  
  * Delete `src/pages/register.tsx`.  
  * Remove the `/register` route from `App.tsx`.  
  * In `login.tsx`, remove the "Don't have an account? Sign Up" footer. The app is Google-only.

**17\. Implement Mobile "Cover" Login Layout**

* **Target:** `src/pages/login.tsx`.  
* **Instruction:** Redesign the layout.  
  * **Container:** `flex flex-col h-screen`.  
  * **Top Section (`flex-1`):** Center the Logo. Remove complex gradients that might band on mobile screens; use a solid brand color or subtle pattern.  
  * **Bottom Section (`p-8 pb-12`):** White background with top-rounded corners (`rounded-t-3xl`). Contains the "Welcome" text and the Google Button.  
  * **Button:** Make the "Continue with Google" button height `h-14` (large touch target).

**18\. "Wizard" UI for Manual Join Fix**

* **Target:** `src/pages/join.tsx` (Error State).  
* **Instruction:** Replace the two buttons with a vertical **Stepper Component**.  
  * **Step 1 Row:** \[ Icon \] \[ Title: Open in Drive \] \[ Action: Button "Open" \].  
  * **Connector:** A vertical line connecting the icons.  
  * **Step 2 Row:** \[ Icon \] \[ Title: Confirm Access \] \[ Action: Button "Select File" \].  
  * **Logic:** Step 2 opacity is 50% until Step 1 is triggered.

**19\. Convert Expense Forms to Drawers**

* **Target:** `src/App.tsx`, `src/components/bottom-navigation.tsx`, `src/pages/dashboard.tsx`.  
* **Instruction:**  
  * **Remove:** The `/add-expense` route (eventually).  
  * **Create:** A global `AddExpenseDrawer` component available at the Layout level.  
  * **Trigger:** Update the Bottom Navigation `+` button to open this Drawer instead of navigating.  
  * **Edit Flow:** For editing, since it requires a URL ID (`/edit-expense/:id`), we can keep the route *but* render the page inside a `Drawer` wrapper that opens automatically on mount, preserving the "Modal" feel while keeping deep-linking capabilities.

### **Phase 7: Navigation & Discovery Refactor**

**20\. Refactor Group Switcher (Navigation Only)**

* **Target:** `src/components/group-switcher-modal.tsx`  
* **Objective:** simplify the header modal to be strictly for **switching context**, reducing cognitive load.  
* **Instruction:**  
  * **Remove:** The "New Group" and "Import" buttons/logic (`useGooglePicker`).  
  * **Add:** A "Manage Groups" button (Secondary/Outline variant) at the bottom footer.  
  * **Action:** Clicking "Manage Groups" navigates to `/groups` and closes the modal.  
  * **Visuals:** Ensure the active group is clearly highlighted. List items must have a minimum height of **44px** for touch accessibility.

**21\. Enhanced Groups Page (Management Hub)**

* **Target:** `src/pages/groups.tsx`  
* **Objective:** Centralize all CRUD and discovery operations in the Groups page.  
* **Instruction:**  
  * **Move Logic:** Migrate the `useGooglePicker` (Import) logic from the switcher to this page.  
  * **Secondary Action:** Add a "Find in Google Drive" (Import) button below the main group list. This acts as the "Recovery Path" for ghost files.  
  * **Layout:** Keep "Create Group" as the primary header action. Place the Import/Find button in a discrete "Troubleshooting" or "Missing a group?" footer section below the list.

**22\. Empty State Guidance (Groups)**

* **Target:** `src/pages/groups.tsx` (Empty State)  
* **Objective:** Educate users on the two ways to join (Magic Link vs. Import) when they have no groups.  
* **Instruction:**  
  * **Content:**  
    * **Primary CTA:** "Create Group" (Button).  
    * **Secondary Text:** "Invited by a friend? Ask them to share the **Magic Link** with you."  
    * **Tertiary Action:** "Or find an existing file in Drive" (Link/Ghost Button triggering Import).  
  * **Icon:** Use a large, muted `FolderSearch` or `Group` icon.
