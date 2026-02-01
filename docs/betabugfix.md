# Beta testing - Debugging and Fixing Bugs

## Executive Summary

This document contains the debugging and fixing of critical bugs found during beta testing of Quozen.

## Bugs Found

### Bug-001: User's name property is not updated when importing a group
    Description: After creating a group and adding a member by email. The invited member when imports the group, the app successfully imports and migrates the user ID to the corresponding Google user ID. However, the app does not migrate the name of the user to the corresponding Google user name.
    Steps to reproduce: Create a group and add a member by email. The invited member imports the group. 
    Actual result: The invited member's name is not migrated to the corresponding Google user name.
    Expected result: The invited member's name is migrated to the corresponding Google user name.

    
    