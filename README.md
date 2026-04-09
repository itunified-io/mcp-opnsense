# mcp-opnsense

[![GitHub release](https://img.shields.io/github/v/release/itunified-io/mcp-opnsense?style=flat-square)](https://github.com/itunified-io/mcp-opnsense/releases)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)](LICENSE)
[![CalVer](https://img.shields.io/badge/calver-YYYY.0M.DD.MICRO-22bfae?style=flat-square)](https://calver.org)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square)](https://nodejs.org)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-62-purple?style=flat-square)](#available-tools-62)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![mcp-opnsense MCP server](https://glama.ai/mcp/servers/itunified-io/mcp-opnsense/badges/card.svg)](https://glama.ai/mcp/servers/itunified-io/mcp-opnsense)

Slim OPNsense MCP Server for managing firewall infrastructure via the OPNsense REST API.

**No SSH. No shell execution. API-only. 3 runtime dependencies.**

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Claude Code Integration](#claude-code-integration)
- [Environment Variables](#environment-variables)
- [Available Tools (62)](#available-tools-62)
- [Claude Code Skills](#claude-code-skills)
- [Known Limitations](#known-limitations)
- [Security](#security)
- [Development](#development)
- [License](#license)

## Features

62 tools across 8 domains:

- **DNS/Unbound** (12) — Host overrides, forwards, blocklist, cache management
- **Firewall** (8) — Rules, aliases, NAT, apply changes
- **Diagnostics** (8) — ARP, routes, ping, traceroute, DNS lookup, firewall states/logs
- **Interfaces** (3) — List, configuration, statistics (read-only)
- **DHCP** (5) — Leases, static mappings (ISC DHCPv4 + Kea dual support)
- **System** (7) — Info, backup (list/download/revert), certificate listing, service control
- **ACME/Let's Encrypt** (14) — Accounts, challenges, certificates, renewal, settings
- **Firmware/Plugins** (5) — Version info, plugin management

## Quick Start

```bash
npm install
cp .env.example .env   # Edit with your OPNsense API credentials
npm run build
node dist/index.js     # stdio transport for MCP
```

## Claude Code Integration

Add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "opnsense": {
      "command": "node",
      "args": ["/path/to/mcp-opnsense/dist/index.js"],
      "env": {
        "OPNSENSE_URL": "https://your-opnsense.example.com",
        "OPNSENSE_API_KEY": "your-api-key",
        "OPNSENSE_API_SECRET": "your-api-secret",
        "OPNSENSE_VERIFY_SSL": "true"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPNSENSE_URL` | Yes | — | OPNsense base URL (e.g. `https://192.168.1.1`) |
| `OPNSENSE_API_KEY` | Yes | — | API key for authentication |
| `OPNSENSE_API_SECRET` | Yes | — | API secret for authentication |
| `OPNSENSE_VERIFY_SSL` | No | `true` | Set to `false` for self-signed certificates |
| `OPNSENSE_TIMEOUT` | No | `30000` | Request timeout in milliseconds |
| `MCP_SECRETS_FILE` | No | — | Path to a key/value file to load on startup (see below) |
| `NAS_VAULT_ADDR` | No | — | HashiCorp Vault URL, enables Vault AppRole loading (see below) |
| `NAS_VAULT_ROLE_ID` | No | — | Vault AppRole role_id |
| `NAS_VAULT_SECRET_ID` | No | — | Vault AppRole secret_id |
| `NAS_VAULT_KV_MOUNT` | No | `kv` | Vault KV v2 mount path |

### Loading Secrets from a File

When the MCP server is launched from a context that does not inherit your shell
environment (e.g. a GUI desktop app launched via `launchd`), `process.env` may
be empty and tool calls will fail with `Invalid URL` errors. To avoid
system-wide environment hacks, point `MCP_SECRETS_FILE` at a file that holds
the required variables:

```sh
export MCP_SECRETS_FILE=~/.mcp-opnsense.env
```

The file is a simple `KEY=value` format (optionally prefixed with `export`,
with single or double quotes around values, `#` comments allowed). Example:

```dotenv
OPNSENSE_URL=https://your-opnsense.example.com
OPNSENSE_API_KEY=your-api-key
OPNSENSE_API_SECRET=your-api-secret
```

The OPNsense web UI "Download as .txt" button generates a two-line file with
lowercase `key=` / `secret=` pairs. That format is also recognized directly —
no rewriting needed:

```
key=your-api-key
secret=your-api-secret
```

**Precedence:** values in `process.env` always win over values from the file,
so the existing shell-based workflow stays fully backward compatible. Missing
or unreadable files are silently skipped (the server will fail with the usual
"required variable" error if nothing is set).

**Security:** the file holds plaintext credentials. Store it outside any git
repository and restrict permissions: `chmod 600 ~/.mcp-opnsense.env`.

### Loading Secrets from HashiCorp Vault (AppRole)

If you run a central Vault instance, `mcp-opnsense` can fetch its credentials
at startup via AppRole instead of storing them in a file. Set:

```sh
export NAS_VAULT_ADDR=https://vault.example.com
export NAS_VAULT_ROLE_ID=<role-id>
export NAS_VAULT_SECRET_ID=<secret-id>
# optional — defaults to "kv"
export NAS_VAULT_KV_MOUNT=kv
```

The loader reads KV v2 at `<mount>/data/opnsense/bifrost` and expects three
keys: `url`, `api_key`, `api_secret`. Example Vault write:

```sh
vault kv put kv/opnsense/bifrost \
  url=https://your-opnsense.example.com \
  api_key=your-api-key \
  api_secret=your-api-secret
```

**Precedence:** `process.env` > Vault > `MCP_SECRETS_FILE`. If `NAS_VAULT_ADDR`
is unset, Vault loading is a silent no-op — the server behaves exactly as
before. On any Vault error (network, auth, missing path), a single-line
warning is written to stderr and the server falls back to whatever env vars
are already set; it will then fail with the usual "required variable" error
if nothing remains.

**Security:** secret values are never logged. Only the KV path name and a
populated-count appear in stderr diagnostics. The loader uses the global
`fetch` (Node 20+) — no new runtime dependencies.

## Available Tools (85)

### DNS/Unbound (12 tools)

| Tool | Description |
|------|-------------|
| `opnsense_dns_list_overrides` | List host overrides (A/AAAA/CNAME) |
| `opnsense_dns_add_override` | Add a host override record |
| `opnsense_dns_delete_override` | Delete a host override by UUID |
| `opnsense_dns_list_forwards` | List DNS-over-TLS forwarding servers |
| `opnsense_dns_add_forward` | Add a DNS forwarding server |
| `opnsense_dns_delete_forward` | Delete a DNS forward by UUID |
| `opnsense_dns_list_blocklist` | List domain overrides (blocked domains) |
| `opnsense_dns_block_domain` | Block a domain |
| `opnsense_dns_unblock_domain` | Unblock a domain by UUID |
| `opnsense_dns_flush_cache` | Flush DNS cache and DNSBL data |
| `opnsense_dns_diagnostics` | Dump DNS cache for diagnostics |
| `opnsense_dns_apply` | Apply DNS changes (reconfigure Unbound) |

### Firewall (10 tools)

| Tool | Description |
|------|-------------|
| `opnsense_fw_list_rules` | List all firewall filter rules |
| `opnsense_fw_add_rule` | Create a firewall rule |
| `opnsense_fw_update_rule` | Update a firewall rule by UUID |
| `opnsense_fw_delete_rule` | Delete a firewall rule by UUID |
| `opnsense_fw_toggle_rule` | Enable/disable a firewall rule |
| `opnsense_fw_reorder_rules` | Change the evaluation order (sequence) of a rule — enforces whitelist-before-deny |
| `opnsense_fw_drift_check` | Audit rule descriptions against a regex (default: `^#\d+:` issue-reference prefix) |
| `opnsense_fw_list_aliases` | List firewall aliases (host, network, port, URL) |
| `opnsense_fw_manage_alias` | Create/update/delete aliases |
| `opnsense_fw_apply` | Apply pending firewall changes |

### Diagnostics (8 tools)

| Tool | Description |
|------|-------------|
| `opnsense_diag_arp_table` | Show ARP table (IP-to-MAC mappings) |
| `opnsense_diag_routes` | Show routing table |
| `opnsense_diag_ping` | Ping a host from OPNsense |
| `opnsense_diag_traceroute` | Traceroute to a destination |
| `opnsense_diag_dns_lookup` | Perform DNS lookup from OPNsense |
| `opnsense_diag_fw_states` | List active firewall connection states |
| `opnsense_diag_fw_logs` | Retrieve recent firewall log entries |
| `opnsense_diag_system_info` | Get system status (CPU, memory, uptime, disk) |

### Interfaces (3 tools, read-only)

| Tool | Description |
|------|-------------|
| `opnsense_if_list` | List all network interfaces with device mappings |
| `opnsense_if_get` | Get detailed interface configuration |
| `opnsense_if_stats` | Get traffic statistics for all interfaces |

### DHCP (5 tools)

| Tool | Description |
|------|-------------|
| `opnsense_dhcp_list_leases` | List all current DHCPv4 leases |
| `opnsense_dhcp_find_lease` | Search leases by IP, MAC, or hostname |
| `opnsense_dhcp_list_static` | List static DHCP mappings (reservations) |
| `opnsense_dhcp_add_static` | Add a static DHCP mapping |
| `opnsense_dhcp_delete_static` | Delete a static mapping by UUID |

### System (7 tools)

| Tool | Description |
|------|-------------|
| `opnsense_sys_info` | Get system status (hostname, versions, CPU, memory, uptime, disk) |
| `opnsense_sys_backup_list` | List all configuration backups with timestamps and descriptions |
| `opnsense_sys_backup_download` | Download configuration backup as XML (current or specific) |
| `opnsense_sys_backup_revert` | Revert to a previous configuration backup (**destructive**) |
| `opnsense_sys_list_certs` | List all certificates in the trust store |
| `opnsense_svc_list` | List all services and their running status |
| `opnsense_svc_control` | Start, stop, or restart a service by name |

### ACME/Let's Encrypt (14 tools)

| Tool | Description |
|------|-------------|
| `opnsense_acme_list_accounts` | List ACME accounts (Let's Encrypt, ZeroSSL, etc.) |
| `opnsense_acme_add_account` | Register a new ACME account with a CA |
| `opnsense_acme_delete_account` | Delete an ACME account by UUID |
| `opnsense_acme_register_account` | Trigger registration of an ACME account with its CA |
| `opnsense_acme_list_challenges` | List all challenge/validation methods |
| `opnsense_acme_add_challenge` | Add a DNS-01 challenge (Cloudflare, AWS, etc.) |
| `opnsense_acme_update_challenge` | Update an existing challenge configuration |
| `opnsense_acme_delete_challenge` | Delete a challenge by UUID |
| `opnsense_acme_list_certs` | List all ACME certificates and their status |
| `opnsense_acme_create_cert` | Create a new certificate request |
| `opnsense_acme_delete_cert` | Delete an ACME certificate by UUID |
| `opnsense_acme_renew_cert` | Trigger immediate certificate renewal |
| `opnsense_acme_settings` | Get or update ACME service settings |
| `opnsense_acme_apply` | Apply pending ACME configuration changes |

### VLANs (4 tools)

| Tool | Description |
|------|-------------|
| `opnsense_vlan_list` | List configured 802.1Q VLAN interfaces (parent, tag, priority, description) |
| `opnsense_vlan_create` | Create a VLAN interface on a parent device |
| `opnsense_vlan_update` | Update VLAN tag, parent, priority, or description |
| `opnsense_vlan_delete` | Delete a VLAN interface by UUID |

### Firmware/Plugins (5 tools)

| Tool | Description |
|------|-------------|
| `opnsense_firmware_info` | Get firmware version, architecture, update status |
| `opnsense_firmware_status` | Check for available firmware upgrades |
| `opnsense_firmware_list_plugins` | List all available and installed plugins |
| `opnsense_firmware_install` | Install an OPNsense plugin package |
| `opnsense_firmware_remove` | Remove a plugin package (requires confirmation) |

## Skills

Claude Code skills compose MCP tools into higher-level workflows. See [`.claude/skills/README.md`](.claude/skills/README.md) for detailed documentation.

| Skill | Slash Command | Description |
|-------|--------------|-------------|
| opnsense-service-health | `/opn-health` | Health dashboard — system status, services, firmware, interfaces |
| opnsense-acme-renew | `/opn-renew-cert` | ACME certificate status check and renewal |
| opnsense-backup | `/opn-backup` | Configuration backup management — list, download, revert |
| opnsense-live-test | `/opn-test` | Live integration test — read + safe writes with cleanup |
| opnsense-diagnostics | — | Network connectivity diagnostics — ping, traceroute, DNS, ARP |
| opnsense-dns-management | — | DNS record management — add, delete, apply, verify resolution |
| opnsense-firewall-audit | — | Firewall security audit — permissive rules, disabled rules, patterns |

## Known Limitations

Some OPNsense operations are not available via the REST API and require manual GUI access:

- **Web GUI SSL certificate assignment** — `ssl-certref` can only be changed via System > Settings > Administration in the web UI. See [docs/manual-operations.md](docs/manual-operations.md).
- **Configuration upload/import** — OPNsense has no API to upload configuration XML files. Use `opnsense_sys_backup_revert` to revert to local backups, or upload via the web GUI.
- **User/group management** — Not exposed via REST API.
- **VPN configuration** — Limited API coverage; most settings require the web UI.

## Security

- **Transport**: stdio only — no HTTP endpoints exposed
- **Authentication**: OPNsense API key/secret via environment variables
- **SSL**: Enabled by default, configurable for self-signed certs
- **No SSH**: All operations use the OPNsense REST API exclusively
- **Input validation**: Strict Zod schemas for all tool parameters
- **Destructive operations**: Require explicit `confirm: true` parameter
- See [SECURITY.md](SECURITY.md) for the full security policy

## Development

```bash
npm test          # Run unit tests (vitest)
npm run build     # Compile TypeScript
npx tsc --noEmit  # Type check only
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

This project is dual-licensed:

- **Open Source**: [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE) — free for open-source and non-commercial use
- **Commercial**: Available for proprietary integrations — see [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md)

If you use mcp-opnsense in a proprietary product or SaaS offering, a commercial license is required. Support development by [sponsoring us on GitHub](https://github.com/sponsors/itunified-io).
