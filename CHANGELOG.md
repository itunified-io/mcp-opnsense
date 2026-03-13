# Changelog

All notable changes to this project will be documented in this file.
This project uses [Calendar Versioning](https://calver.org/) (`YYYY.MM.DD.TS`).


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
