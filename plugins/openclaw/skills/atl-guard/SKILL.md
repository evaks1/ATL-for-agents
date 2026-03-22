---
name: atl-guard
description: >
  ATL permission enforcement skill (template — replaced at runtime by the plugin
  with your actual configured capabilities). Before using any privileged tool,
  call POST http://localhost:3001/atl/verify to check your UCAN delegation.
---

# ATL Guard (Static Template)

This file is a template. When the ATL OpenClaw plugin starts, it overwrites this
file with a version that lists exactly the tools and constraints from your active
ATL delegation.

If you're seeing this at runtime, the plugin may not have started correctly.
Check that `@atl/openclaw-plugin` is installed and `plugins.atl` is configured
in your `~/.openclaw/openclaw.json`.

## Minimal usage (if plugin is running)

Before any tool call that touches the filesystem (write), shell, browser, or
sends agent messages — verify first:

```
POST http://localhost:3001/atl/verify
{ "tool": "<tool_name>", "resource": "<resource>", "action": "<action>" }
```

Responses:
- **ALLOW** → proceed
- **DENY** → block, explain reason_code to user
- **STEP_UP_REQUIRED** → ask user to approve via ATL Console (challenge_id provided)
