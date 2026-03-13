# Security Policy

## Design Principles

- **API-only**: All operations use the OPNsense REST API. No SSH, no shell execution.
- **Transport**: stdio only — no HTTP endpoints are exposed by this server.
- **Credentials**: API key/secret exclusively via environment variables. Never hardcoded, logged, or committed.
- **SSL**: Verification enabled by default. Can be disabled for self-signed certificates via `OPNSENSE_VERIFY_SSL=false`.
- **Input validation**: All tool parameters are validated with strict Zod schemas.
- **Error handling**: Error messages never leak credentials or sensitive configuration.
- **Destructive operations**: `opnsense_sys_restore` requires an explicit confirmation parameter.

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** create a public GitHub issue
2. Email: security@itunified.io
3. Include: description, steps to reproduce, potential impact

We will respond within 48 hours and work with you on a fix before public disclosure.

## Supported Versions

Only the latest CalVer release is actively supported with security patches.
