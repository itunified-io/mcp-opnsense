# Changelog

All notable changes to this project will be documented in this file.
This project uses [Calendar Versioning](https://calver.org/) (`YYYY.MM.DD.TS`).


## v2026.04.10.1

- **Fix `opnsense_kea_subnet_create` and `opnsense_kea_subnet_update` silent failure** (#101)
  - POST payload was using `{ subnet: {...} }` instead of `{ subnet4: {...} }` wrapper
  - OPNsense Kea DHCPv4 API requires `subnet4` as the top-level key for subnet operations
  - Both `keaAddSubnet` and `keaUpdateSubnet` now correctly wrap the payload

## v2026.04.09.5

- **Add `opnsense_if_assign` and `opnsense_if_configure` SSH-backed tools** (#97)
  - New `src/client/ssh-client.ts` — minimal SSH client backed by the system `ssh` binary via `spawn()` (no new runtime dependencies)
  - Strict host key checking enforced via a required `OPNSENSE_SSH_KNOWN_HOSTS` file; no TOFU fallback
  - `BatchMode=yes` + `PreferredAuthentications=publickey` disables password and keyboard-interactive auth
  - Arguments are single-quote-escaped before concatenation into the remote command string — no argv breakout from untrusted tool input
  - New env vars: `OPNSENSE_SSH_ENABLED`, `OPNSENSE_SSH_HOST`, `OPNSENSE_SSH_USER`, `OPNSENSE_SSH_KEY_PATH`, `OPNSENSE_SSH_KNOWN_HOSTS`, `OPNSENSE_SSH_PORT` (default 22), `OPNSENSE_SSH_HELPER_DIR` (default `/usr/local/opnsense/scripts/mcp`), `OPNSENSE_SSH_CONNECT_TIMEOUT` (default 10s)
  - `opnsense_if_assign` — assign a VLAN/NIC device to a free `optN` slot (closes the gap where the OPNsense REST API has no "Interfaces → Assignments" endpoint)
  - `opnsense_if_configure` — set IPv4/IPv6 on an already-assigned `optN` slot (static, dhcp, dhcp6, track6, none)
  - Both tools fail fast with a clear error if `OPNSENSE_SSH_ENABLED` is not `true`, so non-SSH deployments are unaffected
  - PHP `--` separator is inserted automatically (mandatory per ADR-0092 spike: PHP CLI would otherwise swallow `--slot=…` as its own option)
  - Exit codes from the helpers are surfaced to the caller and mapped into the response payload
  - 19 new unit tests (`tests/client/ssh-client.test.ts`) covering constructor validation, `fromEnv()` env-var requirements, SSH argv assembly, helper command building with the mandatory `--` separator, and shell quoting of metacharacter-laden values
  - README: new "SSH-backed interface assignment" section with env var table, OPNsense host setup, mcp-opnsense host setup, and the full security posture
  - Tool count: 85 → 87

## v2026.04.09.4

- **Add `opnsense-helpers/` PHP scripts for SSH-backed interface assignment** (#95)
  - New `opnsense-helpers/if_assign.php` — assign an existing VLAN / NIC device to a free `optN` slot
  - New `opnsense-helpers/if_configure.php` — set IPv4 / IPv6 on an already-assigned `optN` slot (static, dhcp, dhcp6, track6, none)
  - New `opnsense-helpers/README.md` — install procedure + recommended `sudoers.d` whitelist template
  - Fills the gap where the OPNsense REST API has no "Interfaces → Assignments" endpoint
  - Both helpers mirror `interfaces_assign.php` requires (`config.inc`, `filter.inc`, `system.inc`, `interfaces.inc`, `util.inc`)
  - `interfaces_configure()` / `filter_configure()` calls are wrapped in `ob_start()` / `ob_end_clean()` so stdout stays a single JSON object
  - Strict argument validation: slot regex, device regex, description charset, `filter_var()` IP checks, CIDR range
  - Numbered exit codes: `0` success, `1` invalid args, `2` state error, `3` validation, `4` write_config failed, `5` interfaces_configure failed
  - Every `write_config()` call is stamped `mcp-opnsense: ...` so mutations are traceable in the OPNsense backup history
  - Validated end-to-end on OPNsense 24.7 (assign + configure with `ipaddr=none`, read-back, revert)
  - Server-side only — SSH client tools (`opnsense_if_assign`, `opnsense_if_configure`) ship in a follow-up release

## v2026.04.09.3

- **Vault AppRole secret loading** (#93)
  - New opportunistic loader reads `OPNSENSE_URL` / `OPNSENSE_API_KEY` / `OPNSENSE_API_SECRET` from HashiCorp Vault at startup
  - Configured via `NAS_VAULT_ADDR` + `NAS_VAULT_ROLE_ID` + `NAS_VAULT_SECRET_ID` (optional `NAS_VAULT_KV_MOUNT`, default `kv`)
  - KV v2 path: `<mount>/data/opnsense/bifrost` — keys `url`, `api_key`, `api_secret`
  - Precedence: `process.env` > Vault > `MCP_SECRETS_FILE` — fully backwards compatible (silent no-op if `NAS_VAULT_ADDR` is unset)
  - Vault errors are logged to stderr as a single line and never fatal — the server falls back to existing env vars
  - Secret values are never logged; only the KV path name and a populated-count appear in diagnostics
  - No new runtime dependencies — uses global `fetch` (Node 20+)

## v2026.04.09.2

- **Load configuration from a secrets file** (#91)
  - New `MCP_SECRETS_FILE` env var points to a key/value file loaded at startup
  - Supports standard dotenv format (`KEY=value`, optional `export` prefix, quoted values, `#` comments)
  - Also recognizes the OPNsense "Download as .txt" format (lowercase `key=` / `secret=`) and maps it to `OPNSENSE_API_KEY` / `OPNSENSE_API_SECRET`
  - `process.env` values take precedence — fully backward compatible with the shell-sourced workflow
  - Missing or unreadable files are silently skipped
  - Tilde (`~/`) in the file path is expanded to `$HOME`
  - Enables launching the MCP server from GUI desktop apps (launchd does not read `.zshrc`) without system-wide environment hacks
  - New `src/config/secrets-file.ts` module with 19 unit tests
  - README.md: new "Loading Secrets from a File" section with security notes (`chmod 600`, store outside git)

## v2026.04.09.1

- **Add VLAN lifecycle tools and firewall hygiene tools** (#89)
  - `opnsense_fw_reorder_rules` — change rule evaluation order (enforces whitelist-before-deny)
  - `opnsense_fw_drift_check` — audit rule descriptions against a regex (default `^#\d+:` for issue-reference prefix); optional category filter
  - `opnsense_vlan_list` — list 802.1Q VLAN interfaces
  - `opnsense_vlan_create` — create VLAN on a parent interface (auto-reconfigure)
  - `opnsense_vlan_update` — update VID/parent/priority/description (auto-reconfigure)
  - `opnsense_vlan_delete` — delete VLAN interface (auto-reconfigure)
  - New `src/tools/vlan.ts` module with Zod schemas and 802.1Q tag validation (1-4094)
  - Total: 85 tools
  - Note: `opnsense_if_assign` / `opnsense_if_configure` intentionally deferred — OPNsense core has no public REST endpoint for assigning an interface to a logical slot or writing IPv4 settings; the Web UI remains the one-time path for this step

## v2026.03.31.1

- **Add 6 static route management tools** (#84)
  - `opnsense_route_list` — list all configured static routes
  - `opnsense_route_add` — add a static route (network + gateway)
  - `opnsense_route_update` — update an existing static route
  - `opnsense_route_delete` — delete a static route
  - `opnsense_route_apply` — apply route configuration changes
  - `opnsense_route_gateway_list` — list available gateways
  - Zod validation schemas: AddRouteSchema, UpdateRouteSchema, DeleteRouteSchema
  - Total: 74 tools

## v2026.03.19.1

- **Add 7 Kea DHCPv4 subnet management tools** (#82)
  - `opnsense_kea_subnet_list` — list all Kea DHCP subnets
  - `opnsense_kea_subnet_get` — get details for a specific subnet
  - `opnsense_kea_subnet_create` — create a new Kea subnet with pools and options
  - `opnsense_kea_subnet_update` — update an existing Kea subnet
  - `opnsense_kea_subnet_delete` — delete a Kea subnet
  - `opnsense_kea_apply` — apply Kea DHCP configuration changes
  - Zod validation schemas: SubnetSchema, SubnetUpdateSchema, SubnetDeleteSchema
  - Total: 68 tools

## v2026.03.16.2

- **Add pre-publish security scan** (#78)
  - Add `scripts/prepublish-check.js` — blocks `npm publish` if forbidden files (`.mcpregistry_*`, `.env`, `.pem`, `.key`, `credentials`) are in the tarball
  - Add `.npmignore` with comprehensive security exclusions
  - Add `prepublishOnly` npm hook: build + test + security scan before every publish
  - Implements ADR-0026

## v2026.03.16.1

- Add `.mcpregistry_*` to `.gitignore` and update CLAUDE.md security section (ADR-0024) (#76)

## v2026.03.15.2

- Switch Glama badge from score to card format (#67)

## v2026.03.15.1

- Add Glama registry badge to README (#67)

## v2026.03.14.6

- Add skill documentation to README and `.claude/skills/README.md` per ADR-0022 (#71)

## v2026.03.14.5

- Add `docs/superpowers/` to `.gitignore` per ADR-0021 (#69)

## v2026.03.14.4

- Add acceptance criteria gate to CLAUDE.md PR Workflow (ADR-0017) (#65)

## v2026.03.14.3

- Clarify license: internal/commercial use requires commercial license (#63)

## v2026.03.14.2

- Fix `dhcp_list_static`, `dhcp_add_static`, `dhcp_delete_static` failing on ISC DHCP (non-Kea) installations (#61)
- Add automatic DHCP backend detection: try Kea API first, fall back to ISC legacy API
- ISC DHCP uses `/api/dhcpv4/leases/searchStaticMap`, `addStaticMap`, `delStaticMap` endpoints
- Tool descriptions updated to reflect dual backend support

## v2026.03.14.1

- Rename slash commands per ADR-0010 naming convention (#57):
  - `/health` → `/opn-health`
  - `/backup` → `/opn-backup`
  - `/renew-cert` → `/opn-renew-cert`
- Update CLAUDE.md naming convention to document `/<system-short>-<action>` pattern

## v2026.03.13.19

- Fix SECURITY.md: replace internal Slack email with GitHub Security Advisories (#55)
- Scrub Slack workspace email from git history (#55)

## v2026.03.13.18

- Add shields.io badges to README.md (release, license, CalVer, Node.js, MCP tools, TypeScript) (#53)
- Add table of contents to README.md and CLAUDE.md (#53)

## v2026.03.13.17

- Fix 7 OPNsense 24.7 API compatibility issues discovered during live testing (#45, #46, #47, #48, #49, #50, #51):
  - `opnsense_diag_ping`: migrate to job-based API (set→start→poll→remove) (#45)
  - `opnsense_diag_traceroute`: use synchronous POST to `/diagnostics/traceroute/set` (#46)
  - `opnsense_diag_dns_lookup`: use `reverse_lookup` endpoint (forward DNS API removed in 24.7) (#47)
  - `opnsense_diag_fw_states`: use `query_states` endpoint (old endpoint removed) (#48)
  - `opnsense_dhcp_*`: migrate to Kea DHCP API with subnet auto-discovery (#49)
  - `opnsense_if_get`: fix device↔friendly name mapping from `getInterfaceNames` (#50)
  - `opnsense_dns_block/unblock/list_blocklist`: use dots model (addDot/delDot/searchDot) — domain overrides merged into dots in 24.7 (#51)
- Add new `opnsense_diag_reverse_dns` tool for IP→hostname lookups (#47)

## v2026.03.13.16

- Replace broken `opnsense_sys_backup` with 3 new backup tools (#43):
  - `opnsense_sys_backup_list` — list all configuration backups with timestamps
  - `opnsense_sys_backup_download` — download config XML (current or specific backup)
  - `opnsense_sys_backup_revert` — revert to a previous backup (destructive)
- Add `/backup` slash command skill for configuration backup management (#43)
- Fix: old `POST /core/backup/backup` endpoint no longer exists in OPNsense 24.7
- Update tool count from 60 to 62, test count to 68

## v2026.03.13.15

- Add 5 Claude Code skills for higher-level MCP tool orchestration (#41)
  - `opnsense-diagnostics` — auto skill for network connectivity diagnostics
  - `opnsense-dns-management` — auto skill for DNS record management with verification
  - `opnsense-firewall-audit` — auto skill for firewall security audit
  - `opnsense-service-health` — `/health` slash command for dashboard-style health overview
  - `opnsense-acme-renew` — `/renew-cert` slash command for certificate status and renewal
- Add Claude Code Skills section to README.md (#41)
- Add skills conventions section to CLAUDE.md (#41)

## v2026.03.13.14

- Switch license from MIT to AGPL-3.0 + commercial dual license (#39)
- Add COMMERCIAL_LICENSE.md with commercial licensing terms (#39)
- Update README.md with dual-license notice and sponsorship link (#39)
- Update package.json license field to AGPL-3.0-only (#39)

## v2026.03.13.13

- Remove all infrastructure-specific hostnames, IPs, and emails from code, tests, and docs (#37)
- Rewrite git history to scrub exposed hostnames from all prior commits (#37)
- Update SECURITY.md contact to #security-reports Slack channel (#37)
- Fix stale `opnsense_sys_restore` reference in SECURITY.md (#37)

## v2026.03.13.12

- Comprehensive README.md rewrite documenting all 60 tools across 8 domains (#35)
- Add `docs/manual-operations.md` — GUI-only operations (SSL cert, config restore, user mgmt, VPN) (#35)
- Add Known Limitations section to README (#35)

## v2026.03.13.11

- Remove broken `opnsense_sys_set_webgui_cert` tool — OPNsense has no config restore/import API (#33)
- Remove broken `opnsense_sys_restore` tool — `/core/backup/restore` endpoint does not exist (#33)
- Keep `opnsense_sys_list_certs` tool (works correctly)
- Keep `getRaw()` client method (useful for future XML responses)
- Total: 60 tools, 65 tests

## v2026.03.13.10

- Add `opnsense_sys_set_webgui_cert` tool: assign SSL cert to web GUI via config backup/restore (#29)
- Add `opnsense_sys_list_certs` tool: list certificates in trust store with refids (#29)
- Add `getRaw()` method to HTTP client for XML responses (#29)
- Add 12 system tool tests (new test file)
- Total: 62 tools, 68 tests

## v2026.03.13.9

- Fix keyLength mapping: `ec256` → `key_ec256`, `ec384` → `key_ec384` for OPNsense API (#23)
- Fix ACME challenge tool: add provider-specific credential fields (dns_cf_token, dns_cf_account_id, etc.) (#24)
- Fix ACME validation update: use `/update/` endpoint instead of `/set/` which silently drops data (#25)
- Fix ACME settings: use correct `acmeclient` wrapper key for settings API (#26)
- Add `opnsense_acme_settings` tool: get/update ACME service settings (enable, environment, log level) (#27)
- Add `opnsense_acme_register_account` tool: trigger account registration with CA (#28)
- Add `opnsense_acme_update_challenge` tool: update existing challenge configurations (#25)
- Total: 60 tools, 56 tests

## v2026.03.13.8

- Fix ACME API path prefix from `/acme/` to `/acmeclient/` matching os-acme-client plugin (#21)

## v2026.03.13.7

- Fix OPNsense API 400 errors on GET/DELETE requests caused by global Content-Type header (#19)
- Add mandatory bug fix workflow to CLAUDE.md (#19)

## v2026.03.13.6

- Add mandatory design/plan doc workflow to CLAUDE.md (#17)

## v2026.03.13.5

- Add 5 firmware/plugin management tools: info, status, list_plugins, install, remove (#15)
- Add 2 ACME account tools: add_account, delete_account (#15)
- Support for 8 certificate authorities (Let's Encrypt, ZeroSSL, Buypass, SSL.com, Google, etc.)
- 17 new unit tests (firmware + ACME account)
- Total: 57 tools, 49 tests

## v2026.03.13.4

- Elevate CHANGELOG.md to standalone mandatory section in CLAUDE.md (#13)
- Explicit: CHANGELOG.md must exist and every PR merge must add an entry

## v2026.03.13.2

- Add 9 ACME/Let's Encrypt tools with Cloudflare DNS-01 challenge support (#8)
- Tools: list_accounts, list_challenges, add_challenge, delete_challenge, list_certs, create_cert, delete_cert, renew_cert, apply
- DNS provider support: Cloudflare, AWS, GCloud, DigitalOcean, HE, Linode, NS1, OVH, PowerDNS
- 16 unit tests for ACME tools
- Total: 50 tools

## v2026.03.13.1

- Initial release with 41 granular MCP tools
- OPNsense API client (axios, Basic Auth, configurable SSL)
- DNS/Unbound tools (12 tools) — #2
- Firewall tools (8 tools) — #3
- Diagnostics tools (8 tools) — #4
- Interface tools (3 tools, read-only) — #5
- DHCP tools (5 tools, ISC + Kea dual support) — #6
- System tools (5 tools) — #7
- Shared Zod validation schemas (IP, UUID, CIDR, hostname, etc.)
- 16 unit tests (client + DNS)

## v2026.03.31.2

- **Add 2 DNS cache management tools** (#87)
  - `opnsense_dns_flush_zone` — flush cached DNS entries for a specific domain
  - `opnsense_dns_cache_search` — search Unbound DNS cache by domain
  - Update `opnsense_dns_flush_cache` description
  - Total: 76 tools, 73 tests
