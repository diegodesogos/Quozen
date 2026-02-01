# Beta testing - Debugging and Fixing Bugs

## Executive Summary

This document contains the debugging and fixing of critical bugs found during beta testing of Quozen.

## Bugs Found

### Bug-001: User's name property is not updated when importing a group
    Description: After creating a group and adding a member by email. The invited member when imports the group, the app successfully imports and migrates the user ID to the corresponding Google user ID. However, the app does not migrate the name of the user to the corresponding Google user name.
    Steps to reproduce: Create a group and add a member by email. The invited member imports the group. 
    Actual result: The invited member's name is not migrated to the corresponding Google user name.
    Expected result: The invited member's name is migrated to the corresponding Google user name.

### Bug-002: Google Picker has some glitches
    Description: The Google Picker doesn't open at first click in the import group dialog. The console shows the following error: 
```
Blocked aria-hidden on an element because its descendant retained focus. The focus must not be hidden from assistive technology users. Avoid using aria-hidden on a focused element or its ancestor. Consider using the inert attribute instead, which will also prevent focus. For more details, see the aria-hidden section of the WAI-ARIA specification at https://w3c.github.io/aria/#aria-hidden.
Element with focus: <button.inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2 w-full>
Ancestor with aria-hidden: <div.fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg sm:max-w-md#radix-:r0:> <div role=​"dialog" id=​"radix-:​r0:​" aria-describedby=​"radix-:​r2:​" aria-labelledby=​"radix-:​r1:​" data-state=​"open" class=​"fixed left-[50%]​ top-[50%]​ z-50 grid w-full max-w-lg translate-x-[-50%]​ translate-y-[-50%]​ gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]​:​animate-in data-[state=closed]​:​animate-out data-[state=closed]​:​fade-out-0 data-[state=open]​:​fade-in-0 data-[state=closed]​:​zoom-out-95 data-[state=open]​:​zoom-in-95 data-[state=closed]​:​slide-out-to-left-1/​2 data-[state=closed]​:​slide-out-to-top-[48%]​ data-[state=open]​:​slide-in-from-left-1/​2 data-[state=open]​:​slide-in-from-top-[48%]​ sm:​rounded-lg sm:​max-w-md" tabindex=​"-1" style=​"pointer-events:​ auto;​" aria-hidden=​"true">​…​</div>​grid
```

    Steps to reproduce: Click the Import group button. Click in the Picker to find or select files. The picker looks unresponsive, until user clicks again
    Actual result: The picker pops up, UI does seems frozen, until a few seconds, when user clicks again on the picker, it unfreezes and user can select a file.
    Expected result: The picker pops up, UI does not blocks and user can select a file


    
### Bug-003: Settlement is not written to the sheet the right information about which user paid what amount to whom.
    Description: When user settles the expenses, the settlement is not written to the sheet the right information about which user paid what amount to whom.
    Steps to reproduce: Create a group and add a member by email. Then create an expense and split it equally between the two users. Then settle the expense. 
    Actual result: The settlement is not written to the sheet the right information about which user paid what amount to whom. the spreadsheet shows that sheet for Settlements has the following information:
    id	date	fromUserId	toUserId	amount	method	notes
    while the written information for a settlement is:
    7426f9e8-91f2-4849-b07f-50dd46239ebe	2026-02-01T03:29:33.151Z			100	cash
    Expected result: The settlement is written to the sheet the right information about which user paid what amount to whom.

### Bug-004: 
    Description: The settle up and settle clickable links are shown as enabled but when clicked they are doing nothing (in some scenarios where there is nothing to settle). This UI behavior is confusing for the user. The user should not see the settle up and settle links if there is nothing to settle. 
    Steps to reproduce: Create a group and add a member by email. Then create an expense and split it equally between the two users.
    Actual result: The settle up and settle clickable links are shown as enabled but when clicked they are doing nothing (in some scenarios where there is nothing to settle). This UI behavior is confusing for the user. The user should not see the settle up and settle links if there is nothing to settle. 
    Expected result: The settle up and settle clickable links are shown as enabled only when there is something to settle. 

### Bug-005: 
    Description: The balance is not correctly calculated for an imported group. This may be related to Bug-001. The user balance is not updated when a new expense is added by another user.
    Steps to reproduce: Create a group and add a member by email. Then create an expense and split it equally between the two users. Then, the other user will not see its balance udpated properly. 
    Actual result: After another user adds an expense split with the the oher user Z. The user Z's balance shows 0 value.
    Expected result: The user Z's balance shows the right value.

### Bug-006: 
    Description: Inconsistent UI for some actions. edit and delete buttons are not rendered in the same way across all pages. Sometimes edit is a clickable hyperlink and sometimes it shows as a button with an icon and a text. The same applies to delete button. The settle up and settle links are also rendered in an inconsistent way. The UI must show hyperlinks instead of buttons only for those actions that navigate to a different page (e.g "view all" hyperlink). 
    Steps to reproduce: Create a group, and create an expense. Look for edit and delete buttons in the group, and in the expense details.
    Actual result: The edit and delete buttons are not rendered in the same way across all pages. 
    Expected result: The edit and delete buttons are rendered in the same way across all pages. They are rendered using a button and an icon

### Bug-007: 
    Description: Given user Alice and Bob. Alice created a group and added Bob as a member. Then share groupwith Bob. Bob imported group into its app. Now group is visible by both Alice and Bob. If Alice now edit group and removes Bob, operation success. However in Bob's app the group is still visible and if Bob tries to edit or leave the group, it will fail.  
    Steps to reproduce: follow steps mentioned in the description.
    Actual result: Bob has a group on its list which is not part anymore. And Bob cannot remove it from its list. 
    Expected result: When Bob refresh or attemp any operation on the invalid group, if app found Bob is not a member anymore, it should remove the group from Bob's list showing a message to user tht he doesn't belong to the group anymore. 

## Desired changes

The following are not bugs but improvements that I would like to see in the app:

### Balance card
    Description: The balance card in the dashboard page (home), currently shows the total balance of the user. I would like to see below the balance, another description with the total amount spent by the user in the group. That is, balance can be positive or negative (changes with every new expense paid and can become zero by settle up), but the total amount spent by the user is always positive and increase each time the user participates in an expense.