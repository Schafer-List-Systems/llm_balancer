---
name: Test Before Committing
description: Always run tests to verify changes before committing
type: feedback
---
**Rule:** Always test your changes before committing. Never commit untested code.

**Why:** Commits should only be made after changes are verified working. Committing untested code is sloppy and requires reverting/recommitting.

**How to apply:** 
1. Make your code changes
2. Run the relevant tests
3. Verify tests pass
4. ONLY THEN commit

This applies to all code changes, especially bug fixes where tests prove the fix works.