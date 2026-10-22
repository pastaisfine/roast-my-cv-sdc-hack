---
name: GitHub publishing access
description: Distinguish read-only GitHub access from working push authorization in this workspace.
---

In this workspace, `git ls-remote` could read an external GitHub repository, but pushing to it failed with an invalid username/token error even after the GitHub source-control integration reported active. Reauthorization and first-time connection proposals did not provide a usable authorization flow in that session.

**Update, 22 October 2026:** pushing now works. The GitHub CLI is authenticated as `pastaisfine` with a `repo`-scoped token in the keyring, and `git push --dry-run origin main` succeeds. The earlier failure was an environment problem, not a standing permission limit.

**Why:** a remote write was explicitly requested, but the external `main` branch was not changed because credentials were rejected; retrying with force or silently replacing the remote branch would be unsafe.

**How to apply:** Before publishing, verify that push authorization works with a dry run rather than assuming either outcome. If the external branch has unrelated history, preserve its existing files and history; never force-push without explicit user approval. Update this note when the auth state changes, so a later session does not refuse a push that would succeed.
