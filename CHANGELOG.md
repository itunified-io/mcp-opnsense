# Changelog

All notable changes to this project will be documented in this file.
This project uses [Calendar Versioning](https://calver.org/) (`YYYY.MM.DD.TS`).

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
