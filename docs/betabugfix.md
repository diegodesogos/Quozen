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


    
    