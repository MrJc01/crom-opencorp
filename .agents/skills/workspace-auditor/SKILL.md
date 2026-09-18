---
name: workspace-auditor
description: Diagnostic procedures, health checks, and recovery routines for autonomous workspaces in OpenCorp.
---

# Workspace Auditor Skill

This skill provides step-by-step instructions for inspecting, troubleshooting, and recovering stalled workspaces.

## Health Check Checklist
1. **Scheduler Status**:
   - Check `scheduler.db` for quarantined jobs (`quarentena = 1` or consecutive failures > 0):
     ```bash
     sqlite3 ~/.opencorp/scheduler.db "SELECT id, nome, ativo, falhas_consecutivas, quarentena FROM jobs;"
     ```
2. **Pending Stock**:
   - Check if the workspace pipeline has pending items ready for production:
     - In `yt-factory-01`, verify `registries/pautas.json` and ensure corresponding scripts exist in `registries/roteiros/`.
3. **Agent Logs**:
   - Check the latest logs in `<workspace>/logs/` for unexpected exits (`exit null`), rate-limit 429s, or timeout signals.
4. **Kanban Synchronization**:
   - Check the task board in `<workspace>/.opencorp/tasks.db` to see active or blocked tasks:
     ```bash
     oc task list --workspace <id>
     ```

## Recovery Routine for Stalled Workspaces
1. **Clear Quarantine**:
   - Reset consecutive failure counters and reactivate jobs once the root cause is addressed:
     ```bash
     sqlite3 ~/.opencorp/scheduler.db "UPDATE jobs SET ativo = 1, falhas_consecutivas = 0, quarentena = 0 WHERE id = '<job_id>';"
     ```
2. **Test Flow Run Manually**:
   - Execute the flow manually to ensure clean stdout and proper termination:
     ```bash
     oc flow run <flow_id> --workspace <id>
     ```
3. **Verify Pipeline Output**:
   - Confirm that output artifacts (e.g. videos, reports, documents) are generated and registered in `registries/`.
