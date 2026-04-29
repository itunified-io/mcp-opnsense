# Plan 001 — Firmware Upgrade & Reboot Tools

**Issue:** [#110](https://github.com/itunified-io/mcp-opnsense/issues/110)
**Date:** 2026-04-29

## Problem

`mcp-opnsense` cannot trigger OPNsense system upgrades or reboots. Only plugin-level install/remove and read-only firmware status are exposed. This blocks any agentic upgrade workflow (e.g. major series 24.7 → 25.1) and forces fallback to web UI or SSH.

## Solution

Add three tools mapping to existing OPNsense core firmware endpoints:

| Tool | Method | Path | Destructive |
|------|--------|------|-------------|
| `opnsense_firmware_upgrade` | POST | `/core/firmware/upgrade` | yes |
| `opnsense_firmware_upgrade_status` | GET  | `/core/firmware/upgradestatus` | no |
| `opnsense_firmware_reboot` | POST | `/core/firmware/reboot` | yes |

Destructive tools require `confirm: z.literal(true)` (same pattern as `firmware_remove`).

`opnsense_firmware_upgrade` accepts an optional `type` parameter:
- `"update"` (default) — minor/patch updates within current series
- `"upgrade"` — major series jump (e.g. 24.7 → 25.1). Mapped to `POST /core/firmware/upgrade` with `upgrade=1` in body, per OPNsense API.

## Prerequisites

- Existing `OPNsenseClient` already supports `get`/`post`. No client changes needed.
- Tool placement approved (ADR-0041): public repo.

## Execution Steps

1. Extend `src/tools/firmware.ts`:
   - Zod schemas: `UpgradeSchema` (with `confirm` + optional `type`), `RebootSchema` (`confirm` only)
   - Tool definitions added to `firmwareToolDefinitions`
   - Switch cases in `handleFirmwareTool`
2. Add unit tests in `tests/firmware.test.ts` (or update existing) — assert payload shape, confirm-gate, endpoint path
3. Update `CHANGELOG.md` with new CalVer entry
4. Update `README.md`: tool count and Firmware section
5. Build (`npm run build`) and test (`npm test`) — must be green
6. Commit, PR, merge, tag, release per repo workflow

## Rollback

Tools are additive. If a regression is detected post-release, revert the PR and publish a new patch. No state held in MCP — all destructive ops are gated by `confirm`.

## Verification

- Unit tests pass
- Live verification (separate, in infra repo): trigger upgrade on bifrost, poll `upgrade_status`, observe completion, then `reboot` (or rely on auto-reboot)
