# mcp-opnsense — CLAUDE.md

## Project Overview

Slim OPNsense MCP Server for managing firewall infrastructure via the OPNsense REST API. Provides ~50 granular tools for DNS, Firewall, Diagnostics, Interfaces, DHCP, and System management.

**No SSH. No shell execution. API-only.**

## Architecture

```
src/
  index.ts                 # MCP Server entry point (stdio transport only)
  client/
    opnsense-client.ts     # Axios HTTP client (Basic Auth, SSL, error handling)
    types.ts               # OPNsense API response types
  tools/
    dns.ts                 # 12 DNS/Unbound tools
    firewall.ts            # 8 Firewall tools
    diagnostics.ts         # 8 Diagnostics tools
    interfaces.ts          # 3 Interface tools (read-only)
    dhcp.ts                # 5 DHCP tools (ISC + Kea dual support)
    system.ts              # 5 System/Service tools
    acme.ts                # 9 ACME/Let's Encrypt tools
  utils/
    validation.ts          # Shared Zod schemas (IP, UUID, CIDR, etc.)
    errors.ts              # OPNsense error extraction
tests/                     # Vitest unit tests
docs/
  api-reference.md         # OPNsense API endpoint mapping
```

## Code Conventions

### TypeScript
- Strict mode enabled (`"strict": true` in tsconfig.json)
- All tool parameters validated with Zod schemas
- Generically typed API client (`get<T>()`, `post<T>()`, `delete<T>()`)
- No `any` types — use `unknown` and narrow

### Tool Design
- **Granular tools**: one MCP tool per operation (e.g., `opnsense_dns_add_override`)
- Tool naming: `opnsense_<domain>_<action>`
- Each tool has its own Zod input schema and clear description
- Destructive operations require confirmation parameters

### Dependencies
- **3 runtime dependencies only**: `@modelcontextprotocol/sdk`, `axios`, `zod`
- No SSH libraries, no Redis, no PostgreSQL
- Dev: `typescript`, `vitest`, `@types/node`

## Security

- **Transport**: stdio only (no SSE, no HTTP endpoint)
- **Authentication**: API Key/Secret via environment variables only
- **SSL**: Enabled by default, configurable for self-signed certs
- **No SSH**: Exclusively OPNsense REST API
- **Input validation**: Zod schemas for all tool parameters
- **Error handling**: No credential leaks in error messages
- **Credentials**: Never hardcoded, never logged, never in git

## Versioning (CalVer)

- Schema: `YYYY.MM.DD.TS` (e.g., `2026.03.13.1`)
- `package.json`: npm-compatible without leading zeros (`2026.3.13`)
- Git tags: `v2026.03.13.1` (leading zeros for sorting)
- CHANGELOG.md: CalVer-based with date headers

## Git Workflow

- **NEVER work on main** — all changes via feature branches + PR
- **Branching**: `feature/<issue-nr>-<description>`, `fix/<issue-nr>-<description>`, `chore/<description>`
- **Worktree naming**: `.claude/worktrees/<branch-name>`
- **GitHub Issues mandatory**: every change must have an associated GH issue
- **Commit messages**: must reference GH issue — `feat: add DNS override tool (#12)` or `fix: handle SSL timeout (#5)`
- **No commit without issue reference** (exceptions: initial setup, typo fixes)
- **PR workflow**: feature branch -> `gh pr create` -> review -> merge into main
- **After PR merge: branch/worktree cleanup is mandatory** — `git branch -d <branch>`, `git remote prune origin`, remove worktree. Prevents drift.

## Language

- All documentation, code comments, commit messages: **English only**

## Development Setup

```bash
# Prerequisites: Node.js >= 20, npm

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your OPNsense API credentials

# Build
npm run build

# Test
npm test

# Run (stdio transport)
node dist/index.js
```

## Testing

- Unit tests with vitest (mocked API responses)
- Zod schema validation for invalid inputs
- Error handling for API errors (401, 403, 404, 500)
- Run: `npm test`
