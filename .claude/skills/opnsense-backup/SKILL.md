---
name: opn-backup
description: OPNsense configuration backup management — list, download, and revert backups
disable-model-invocation: true
---

# /opn-backup — OPNsense Configuration Backup

Manage OPNsense configuration backups: list available backups, download config XML, and revert to a previous configuration.

## Workflow

### Step 1: Gather System Context and Backup List

Run these tools **in parallel**:

- `opnsense_sys_info` — get current system version and hostname
- `opnsense_sys_backup_list` — list all available configuration backups

### Step 2: Present Backup Dashboard

Format results as a structured dashboard:

```
## OPNsense Backup Dashboard

### System
- Hostname: ...
- Version: ...

### Available Backups (most recent first)
| # | Timestamp | Description | User | Size |
|---|-----------|-------------|------|------|
| 1 | 2026-03-13 17:37 | /system_advanced_admin.php made changes | root@... | 75 KB |
| 2 | ... | ... | ... | ... |

Total: N backups available
```

### Step 3: Offer Actions

Present available actions to the user:

1. **Download current config** — downloads the running configuration as XML
2. **Download specific backup** — downloads a specific backup by ID
3. **Revert to backup** — reverts to a previous configuration (**DESTRUCTIVE** — requires confirmation)

Wait for user to choose an action.

### Step 4: Execute Action

**If download (current or specific):**
- Call `opnsense_sys_backup_download` (with `backup_id` if specific)
- Present the XML content or note its size
- Remind the user this is sensitive configuration data

**If revert:**
- **MUST ask for explicit user confirmation** before proceeding
- Show the backup details (timestamp, description, user) being reverted to
- Ask: "This will replace the running configuration. Are you sure? (yes/no)"
- Only call `opnsense_sys_backup_revert` with the confirmed `backup_id` after user says "yes"
- After revert, call `opnsense_sys_info` to verify the system is responsive

## MCP Tools Used

| Tool | Purpose | Destructive |
|------|---------|-------------|
| `opnsense_sys_info` | System context (version, hostname) | No |
| `opnsense_sys_backup_list` | List available backups | No |
| `opnsense_sys_backup_download` | Download config XML | No |
| `opnsense_sys_backup_revert` | Revert to previous config | **Yes** |

## Important Notes

- **Revert is destructive** — always confirm with the user before executing
- Config XML contains sensitive data (passwords, API keys) — warn the user
- After revert, the OPNsense web UI may restart — expect a brief disconnection
- Backups are stored on the OPNsense filesystem under `/conf/backup/`
- There is no API to create a new backup or upload a config file — use the web GUI for those operations
