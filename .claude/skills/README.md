# mcp-opnsense Skills Reference

## Overview

Claude Code skills compose multiple MCP tools into higher-level workflows. Skills are defined in `.claude/skills/<name>/SKILL.md` with YAML frontmatter and are auto-discovered by Claude Code.

**Slash command skills** (`disable-model-invocation: true`) are invoked explicitly by the user via `/command`. **Auto-invocable skills** are triggered automatically by Claude when relevant context is detected.

## Quick Reference

| Skill | Type | Slash Command | Description |
|-------|------|--------------|-------------|
| opnsense-service-health | Slash | `/opn-health` | Health dashboard — system status, services, firmware, interfaces |
| opnsense-acme-renew | Slash | `/opn-renew-cert` | ACME certificate status check and renewal |
| opnsense-backup | Slash | `/opn-backup` | Configuration backup management — list, download, revert |
| opnsense-live-test | Slash | `/opn-test` | Live integration test — read + safe writes with cleanup |
| opnsense-diagnostics | Auto | — | Network connectivity diagnostics — ping, traceroute, DNS, ARP |
| opnsense-dns-management | Auto | — | DNS record management — add, delete, apply, verify resolution |
| opnsense-firewall-audit | Auto | — | Firewall security audit — permissive rules, disabled rules, patterns |

---

## Skill Details

### opnsense-service-health (`/opn-health`)

**Type:** Slash command
**Description:** Produces a dashboard-style health overview of the OPNsense firewall covering system status, running services, firmware update status, interface traffic, and DHCP lease counts. Used by scheduled monitoring agents and on-demand by operators.

**Tools used:**
- `opnsense_sys_info` — System status (hostname, CPU, memory, uptime, disk)
- `opnsense_svc_list` — Service running status
- `opnsense_firmware_info` — Firmware version and architecture
- `opnsense_firmware_status` — Available upgrades
- `opnsense_if_list` — Network interfaces
- `opnsense_if_stats` — Interface traffic statistics
- `opnsense_dhcp_list_leases` — Active DHCP leases

**Usage:** `/opn-health`

---

### opnsense-acme-renew (`/opn-renew-cert`)

**Type:** Slash command
**Description:** Checks ACME certificate expiry status and triggers renewal if certificates are approaching expiry. Lists all certificates with days remaining.

**Tools used:**
- `opnsense_acme_settings` — ACME service settings
- `opnsense_acme_list_certs` — List all ACME certificates and status
- `opnsense_sys_list_certs` — Certificates in trust store
- `opnsense_acme_renew_cert` — Trigger certificate renewal
- `opnsense_acme_apply` — Apply ACME configuration

**Usage:** `/opn-renew-cert`

---

### opnsense-backup (`/opn-backup`)

**Type:** Slash command
**Description:** Manages OPNsense configuration backups. Lists available backups with timestamps, downloads config XML, and can revert to a previous configuration.

**Tools used:**
- `opnsense_sys_info` — System identification
- `opnsense_sys_backup_list` — List all configuration backups
- `opnsense_sys_backup_download` — Download config as XML
- `opnsense_sys_backup_revert` — Revert to previous config (destructive, requires confirmation)

**Usage:** `/opn-backup`

---

### opnsense-live-test (`/opn-test`)

**Type:** Slash command
**Description:** Runs live integration tests against the OPNsense API to verify all MCP tools work correctly. Tests read-only tools and performs safe write+cleanup cycles for DNS overrides, firewall rules, and DHCP static mappings.

**Tools used:** All 62 tools across all domains (DNS, firewall, diagnostics, interfaces, DHCP, system, ACME, firmware).

**Usage:** `/opn-test` (all domains) or `/opn-test dns` (single domain)

**Available domains:** `dns`, `firewall`, `diagnostics`, `interfaces`, `dhcp`, `system`, `acme`, `firmware`

---

### opnsense-diagnostics

**Type:** Auto-invocable
**Description:** Runs a structured diagnostic workflow when connectivity issues, network problems, or troubleshooting is needed. Covers ping, traceroute, DNS lookup, ARP table, routing, and firewall state/log analysis.

**Tools used:**
- `opnsense_diag_ping` — Ping a host
- `opnsense_diag_traceroute` — Traceroute to destination
- `opnsense_diag_dns_lookup` — DNS lookup
- `opnsense_diag_arp_table` — ARP table (IP-to-MAC)
- `opnsense_diag_routes` — Routing table
- `opnsense_diag_fw_states` — Active firewall states
- `opnsense_diag_fw_logs` — Recent firewall log entries

**Triggers:** User reports connectivity issues, network problems, or asks to troubleshoot why a host can't be reached.

---

### opnsense-dns-management

**Type:** Auto-invocable
**Description:** Orchestrates DNS record management on OPNsense Unbound with verification. Covers adding, deleting, and applying host overrides, managing blocklist entries, and verifying DNS resolution.

**Tools used:**
- `opnsense_dns_list_overrides` — List host overrides
- `opnsense_dns_add_override` — Add host override
- `opnsense_dns_delete_override` — Delete host override
- `opnsense_dns_apply` — Apply DNS changes (reconfigure Unbound)
- `opnsense_dns_list_blocklist` — List blocked domains
- `opnsense_dns_block_domain` — Block a domain
- `opnsense_dns_unblock_domain` — Unblock a domain
- `opnsense_diag_dns_lookup` — Verify DNS resolution

**Triggers:** User asks to add, delete, or manage DNS records, or verify DNS resolution.

---

### opnsense-firewall-audit

**Type:** Auto-invocable
**Description:** Performs a security audit of the OPNsense firewall configuration. Identifies overly permissive rules (any/any), disabled rules, unused aliases, and suspicious patterns in firewall logs and states.

**Tools used:**
- `opnsense_fw_list_rules` — List all firewall rules
- `opnsense_fw_list_aliases` — List firewall aliases
- `opnsense_diag_fw_states` — Active connection states
- `opnsense_diag_fw_logs` — Recent firewall log entries

**Triggers:** User asks for a firewall audit, security review, or rule analysis.
