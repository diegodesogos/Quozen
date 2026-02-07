# **Technical Design Spec: Activity Hub & Transfers**

**Epic:** UI Refactor \- Activity Hub **Role:** Product Designer (Aura) **Status:** Completed

**Status**: ✅ **Completed**

## **1\. Design Philosophy**

The **Activity Hub** acts as the central ledger for the group. It is a "Read/Manage" view, not a "Create" view.

* **Expenses Tab:** Shows consumption (Money leaving the group). It shows the content currently present in the actual Expenses page.  
* **Transfers Tab:** Shows redistribution (Money moving *within* the group).  
* **"Me-Centric" Visuals:** We use color (Green/Orange) *only* to signal impact on the logged-in user's wallet. Group administrative data is rendered in neutral Grey to reduce cognitive load.

---

## **2\. Wireframe Specifications**

### **A. Page Layout (Container)**

* **File:** `src/pages/activity-hub.tsx` (Refactor of `expenses.tsx`)  
* **Context:** Replaces the current "All Expenses" view.

**\[Screen\] \- Activity Hub**

**1\. Header Area (Sticky)**

* **Title:** "Group Activity" (Centered/Left aligned).  
* **Right Actions:** * `[Filter Icon]`: Existing filter modal (Category/Date).  
  * `[Sort Icon]`: Existing sort logic.  
  * *Removed:* "New" buttons (handled in Bottom Nav/Dashboard).

**2\. Navigation (Tabs)**

* **Component:** `Tabs`, `TabsList`, `TabsTrigger` (from `@/components/ui/tabs`).  
* **State:** Persist active tab in URL query param (e.g., `?tab=transfers`) or local state.  
* **Tab 1:** "Expenses" (Active Default)  
* **Tab 2:** "Transfers" (The new feature)

### **B. Tab 1: Expenses List**

* **Content:** Keep the existing logic from `src/pages/expenses.tsx`.  
* **Minor Tweak:** Ensure the list container respects the new Tab height so scrolling works correctly.

### **C. Tab 2: Transfers List (New)**

This is the core innovation. It visualizes the `settlements` array from `groupData`.

**\[Tab Content\] \- Transfers**

**1\. Context Control (Sub-header)**

* **Layout:** Flex row, Justify Between, Padding `py-4`.  
* **Label:** "My Transfers" (Heading style).  
* **Control:** * **Text:** "My Transfers" or "Show All" (Small, Muted).  
  * **Element:** `Switch` (Toggle).  
  * **Interaction:** Toggles visibility of "Grey" (Third-party) transactions.

**2\. The Transfer Feed (List)**

* **Sorting:** Date Descending (Newest first).  
* **Empty State:** * **Icon:** `Handshake` (Lucide).  
  * **Text:** "No transfers recorded yet."  
  * **Subtext:** "Settle debts from the Dashboard." The Dashboard text shows as hyperlink, when clicked the user is moved to Dashboard.

**3\. The Transfer Card (Item)**

* **Visual Pattern:** `[Avatar A] ── [Arrow + Amount] ──> [Avatar B]`  
* **Click Action:** Opens **Edit Settlement Modal**.

## **3\. Component Specifications**

### **Component: TransferCard**

This component renders a single settlement row.

| State | Condition | Visual Style | Directional Logic |
| :---- | :---- | :---- | :---- |
| **Inbound** | toUserId \=== currentUser | **Text/Arrow:** Green (text-green-600) **Opacity:** 100% | \[Sender\] ───\> \[You\] |
| **Outbound** | fromUserId \=== currentUser | **Text/Arrow:** Orange (text-orange-600) **Opacity:** 100% | \[You\] ───\> \[Receiver\] |
| **Neutral** | \!Inbound && \!Outbound | **Text/Arrow:** Muted Grey (text-muted-foreground) **Opacity:** 75% (Faded) | \[Sender\] ───\> \[Receiver\] |

#### **Layout Mockup (Tailwind-ish)**

TypeScript  
\<Card className={cn("mb-3", isNeutral && "opacity-75 bg-muted/30")}\>  
  \<CardContent className="flex items-center justify-between p-4"\>  
      
    {/\* Left: Sender \*/}  
    \<div className="flex flex-col items-center gap-1 w-16"\>  
      \<Avatar user={sender} /\>  
      \<span className="text-xs truncate max-w-full"\>{isMe(sender) ? "You" : sender.name}\</span\>  
    \</div\>

    {/\* Center: The Flow \*/}  
    \<div className="flex flex-col items-center flex-1 px-2"\>  
      \<div className={cn("text-lg font-bold", statusColor)}\>  
        ${amount.toFixed(2)}  
      \</div\>  
      \<ArrowRight className={cn("w-6 h-6 my-1", statusColor)} /\>  
      \<span className="text-\[10px\] text-muted-foreground"\>{date}\</span\>  
    \</div\>

    {/\* Right: Receiver \*/}  
    \<div className="flex flex-col items-center gap-1 w-16"\>  
      \<Avatar user={receiver} /\>  
      \<span className="text-xs truncate max-w-full"\>{isMe(receiver) ? "You" : receiver.name}\</span\>  
    \</div\>

  \</CardContent\>  
\</Card\>

---

## **4\. Functional Requirements (Logic)**

### **A. Filtering Logic (The Toggle)**

The Engineer needs to implement a derived state for the list.

JavaScript  
// Requirement: Filter settlements based on Toggle State  
const filteredSettlements \= useMemo(() \=\> {  
  if (showAllLedger) return groupData.settlements;  
    
  // Default: Only show if I am the Payer OR the Receiver  
  return groupData.settlements.filter(s \=\>   
    s.fromUserId \=== currentUserId || s.toUserId \=== currentUserId  
  );  
}, \[groupData.settlements, showAllLedger, currentUserId\]);

### **B. Editing & Deletion**

Since the user needs to **Edit/Remove** settlements:

1. **Refactor `SettlementModal`:** * Update `src/components/settlement-modal.tsx` to accept an optional `initialData` prop (type `Settlement`).  
   * If `initialData` exists:  
     * Title changes to "Edit Settlement".  
     * Button changes to "Update".  
     * Add a secondary "Delete" button (Destructive variant) to the footer.  
2. **Add Delete Mutation:** * The engineer needs to create `deleteSettlement` in `google-drive.ts` (similar to `deleteExpense`) handling the specific row index logic.

### **5\. Accessibility Notes (WCAG 2.2)**

* **Color Blindness:** Do not rely on Red/Green alone. The layout **must** consistently place the "Sender" on the Left and "Receiver" on the Right. The Arrow Icon provides the structural cue.  
* **Screen Readers:** The card should read as a full sentence, not just fragments.  
  * *Bad:* "Alice. Arrow. 50 dollars. Bob."  
  * *Good (aria-label):* "Alice paid Bob 50 dollars on October 12th."

This spec aligns with your request to keep the UI clean, "Me-Centric", and focused on utility while allowing full group transparency when needed.
