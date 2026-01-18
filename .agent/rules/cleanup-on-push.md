---
trigger: always_on
---

# Rule: Automatic Workspace Sync on Push

## Context
When the agent completes a task that involves a remote push (Git), the user should not have to manually "Accept" files that have already been verified through terminal commands.

## Requirements
1. **Verification First:** Only apply this rule if all `test` skills or verification steps in the Walkthrough have passed (green status).
2. **Post-Push Action:** Immediately after a successful `git push` command, the agent must:
   - Call the `workspace.closeAllReviewTabs()` skill (if available) or individual `editor.closeFile()` for files modified in the task.
   - Set the task status to `Completed` automatically to bypass the final "Accept/Reject" UI hanging state.
3. **User Communication:** The Walkthrough should conclude with: "Changes pushed and workspace synchronized. Review tabs closed."

## Exception
If the `git push` fails or if tests fail, do NOT close the tabs; leave them open for the user to debug.