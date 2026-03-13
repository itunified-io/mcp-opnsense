# mcp-opnsense

Slim OPNsense MCP Server for managing firewall infrastructure via the OPNsense REST API.

**No SSH. No shell execution. API-only. 3 runtime dependencies.**

## Features

60 tools across 8 domains:

- **DNS/Unbound** (12) — Host overrides, forwards, blocklist, cache management
- **Firewall** (8) — Rules, aliases, NAT, apply changes
- **Diagnostics** (8) — ARP, routes, ping, traceroute, DNS lookup, firewall states/logs
- **Interfaces** (3) — List, configuration, statistics (read-only)
- **DHCP** (5) — Leases, static mappings (ISC DHCPv4 + Kea dual support)
- **System** (5) — Info, backup, certificate listing, service control
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

## Available Tools (60)

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

### Firewall (8 tools)

| Tool | Description |
|------|-------------|
| `opnsense_fw_list_rules` | List all firewall filter rules |
| `opnsense_fw_add_rule` | Create a firewall rule |
| `opnsense_fw_update_rule` | Update a firewall rule by UUID |
| `opnsense_fw_delete_rule` | Delete a firewall rule by UUID |
| `opnsense_fw_toggle_rule` | Enable/disable a firewall rule |
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

### System (5 tools)

| Tool | Description |
|------|-------------|
| `opnsense_sys_info` | Get system status (hostname, versions, CPU, memory, uptime, disk) |
| `opnsense_sys_backup` | Create a configuration backup |
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

### Firmware/Plugins (5 tools)

| Tool | Description |
|------|-------------|
| `opnsense_firmware_info` | Get firmware version, architecture, update status |
| `opnsense_firmware_status` | Check for available firmware upgrades |
| `opnsense_firmware_list_plugins` | List all available and installed plugins |
| `opnsense_firmware_install` | Install an OPNsense plugin package |
| `opnsense_firmware_remove` | Remove a plugin package (requires confirmation) |

## Known Limitations

Some OPNsense operations are not available via the REST API and require manual GUI access:

- **Web GUI SSL certificate assignment** — `ssl-certref` can only be changed via System > Settings > Administration in the web UI. See [docs/manual-operations.md](docs/manual-operations.md).
- **Configuration restore/import** — OPNsense has no API to upload/import configuration XML. Only local backup revert is supported.
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

MIT — see [LICENSE](LICENSE)
