# mcp-opnsense

Slim OPNsense MCP Server for managing firewall infrastructure via the OPNsense REST API.

**No SSH. No shell execution. API-only. 3 runtime dependencies.**

## Features

- **DNS/Unbound** — Host overrides, forwards, blocklist, cache management
- **Firewall** — Rules, aliases, NAT, apply changes
- **Diagnostics** — ARP table, routes, ping, traceroute, DNS lookup, firewall states/logs
- **Interfaces** — List, configuration, statistics (read-only)
- **DHCP** — Leases, static mappings (ISC DHCPv4 + Kea dual support)
- **System** — Info, backup/restore, service control
- **ACME/Let's Encrypt** — Accounts, DNS-01 challenges (Cloudflare, AWS, etc.), certificates, renewal
- **Firmware/Plugins** — System info, plugin management (install/remove)

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your OPNsense credentials

# Build
npm run build

# Run (stdio transport for MCP)
node dist/index.js
```

## Claude Code Integration

Add to your Claude Code MCP configuration (`~/.claude/mcp_settings.json`):

```json
{
  "mcpServers": {
    "opnsense": {
      "command": "node",
      "args": ["/path/to/mcp-opnsense/dist/index.js"],
      "env": {
        "OPNSENSE_URL": "https://10.10.0.1",
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
| `OPNSENSE_URL` | Yes | — | OPNsense base URL (e.g., `https://10.10.0.1`) |
| `OPNSENSE_API_KEY` | Yes | — | API key for authentication |
| `OPNSENSE_API_SECRET` | Yes | — | API secret for authentication |
| `OPNSENSE_VERIFY_SSL` | No | `true` | Set to `false` for self-signed certificates |
| `OPNSENSE_TIMEOUT` | No | `30000` | Request timeout in milliseconds |

## Available Tools

### DNS/Unbound (12 tools)
| Tool | Description |
|------|-------------|
| `opnsense_dns_list_overrides` | List host overrides (A/AAAA/CNAME) |
| `opnsense_dns_add_override` | Add a host override record |
| `opnsense_dns_delete_override` | Delete a host override by UUID |
| `opnsense_dns_list_forwards` | List DNS forward servers |
| `opnsense_dns_add_forward` | Add a DNS forward server |
| `opnsense_dns_delete_forward` | Delete a DNS forward by UUID |
| `opnsense_dns_list_blocklist` | List blocked domains |
| `opnsense_dns_block_domain` | Block a domain |
| `opnsense_dns_unblock_domain` | Unblock a domain by UUID |
| `opnsense_dns_flush_cache` | Flush DNS cache |
| `opnsense_dns_diagnostics` | Get DNS cache and statistics |
| `opnsense_dns_apply` | Apply DNS changes (reconfigure Unbound) |

### Firewall (8 tools)
| Tool | Description |
|------|-------------|
| `opnsense_fw_list_rules` | List firewall filter rules |
| `opnsense_fw_add_rule` | Create a firewall rule |
| `opnsense_fw_update_rule` | Update a firewall rule by UUID |
| `opnsense_fw_delete_rule` | Delete a firewall rule by UUID |
| `opnsense_fw_toggle_rule` | Enable/disable a firewall rule |
| `opnsense_fw_list_aliases` | List firewall aliases |
| `opnsense_fw_manage_alias` | Create/update/delete aliases |
| `opnsense_fw_apply` | Apply firewall changes |

### Diagnostics (8 tools)
| Tool | Description |
|------|-------------|
| `opnsense_diag_arp_table` | Get ARP table |
| `opnsense_diag_routes` | Get routing table |
| `opnsense_diag_ping` | Ping a host |
| `opnsense_diag_traceroute` | Traceroute to a host |
| `opnsense_diag_dns_lookup` | Perform DNS lookup |
| `opnsense_diag_fw_states` | List active firewall states |
| `opnsense_diag_fw_logs` | Get firewall logs |
| `opnsense_diag_system_info` | Get system info (version, uptime) |

### Interfaces (3 tools, read-only)
| Tool | Description |
|------|-------------|
| `opnsense_if_list` | List all interfaces |
| `opnsense_if_get` | Get interface configuration |
| `opnsense_if_stats` | Get interface statistics |

### DHCP (5 tools, ISC + Kea)
| Tool | Description |
|------|-------------|
| `opnsense_dhcp_list_leases` | List active DHCP leases |
| `opnsense_dhcp_find_lease` | Find lease by IP, MAC, or hostname |
| `opnsense_dhcp_list_static` | List static DHCP mappings |
| `opnsense_dhcp_add_static` | Add a static DHCP mapping |
| `opnsense_dhcp_delete_static` | Delete a static mapping by UUID |

### System (5 tools)
| Tool | Description |
|------|-------------|
| `opnsense_sys_info` | Get system version and uptime |
| `opnsense_sys_backup` | Create configuration backup |
| `opnsense_sys_restore` | Restore configuration (requires confirmation) |
| `opnsense_svc_list` | List services and their status |
| `opnsense_svc_control` | Start/stop/restart a service |

### ACME/Let's Encrypt (11 tools)
| Tool | Description |
|------|-------------|
| `opnsense_acme_list_accounts` | List ACME accounts (Let's Encrypt, ZeroSSL) |
| `opnsense_acme_add_account` | Register a new ACME account |
| `opnsense_acme_delete_account` | Delete an ACME account by UUID |
| `opnsense_acme_list_challenges` | List challenge/validation methods |
| `opnsense_acme_add_challenge` | Add DNS-01 challenge (Cloudflare, AWS, etc.) |
| `opnsense_acme_delete_challenge` | Delete a challenge by UUID |
| `opnsense_acme_list_certs` | List certificates and status |
| `opnsense_acme_create_cert` | Create a new certificate request |
| `opnsense_acme_delete_cert` | Delete a certificate by UUID |
| `opnsense_acme_renew_cert` | Trigger certificate renewal |
| `opnsense_acme_apply` | Apply ACME configuration changes |

### Firmware/Plugins (5 tools)
| Tool | Description |
|------|-------------|
| `opnsense_firmware_info` | Get firmware version and update status |
| `opnsense_firmware_status` | Check firmware upgrade status |
| `opnsense_firmware_list_plugins` | List available and installed plugins |
| `opnsense_firmware_install` | Install a plugin package |
| `opnsense_firmware_remove` | Remove a plugin package (requires confirmation) |

## Security

- **Transport**: stdio only — no HTTP endpoints exposed
- **Authentication**: OPNsense API key/secret via environment variables
- **SSL**: Enabled by default
- **No SSH**: All operations use the OPNsense REST API exclusively
- **Input validation**: Strict Zod schemas for all tool parameters
- See [SECURITY.md](SECURITY.md) for the full security policy

## Development

```bash
# Run tests
npm test

# Build
npm run build

# Type check
npx tsc --noEmit
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

MIT — see [LICENSE](LICENSE)
