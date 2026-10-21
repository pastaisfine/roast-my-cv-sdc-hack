---
name: GitHub publishing access
description: Distinguish read-only GitHub access from working push authorization in this workspace.
---

In this workspace, `git ls-remote` could read an external GitHub repository, but pushing to it failed with an invalid username/token error even after the GitHub source-control integration reported active. Reauthorization and first-time connection proposals did not provide a usable authorization flow in this session. Do not treat a successful read probe or an “active” status as proof that a write will work.

The integration directory can report `not_added` while attaching the same connection reports `connectionAlreadyAdded` and active. Repeating attachment is not evidence that authentication is repaired; stop retrying when the actual push still rejects the credential.

**Why:** A remote write was explicitly requested, but the external `main` branch was not changed because credentials were rejected; retrying with force or silently replacing the remote branch would be unsafe.

**How to apply:** Before publishing, verify that push authorization works. If the external branch has unrelated history, preserve its existing files and history; never force-push without explicit user approval.
