# Plan 002 — System Log + Gateway Status Tools

**Issue:** [#113](https://github.com/itunified-io/mcp-opnsense/issues/113)
**Date:** 2026-04-29

## Problem

`mcp-opnsense` cannot retrieve system, gateway, routing, or resolver logs from OPNsense, and cannot read live gateway monitor state (RTT, loss, online/offline). This blocks WAN-health debugging — e.g. when `monitor_disable: 1` is set on a WAN gateway, operators have no MCP-driven way to confirm the issue, look at gateway daemon logs, or correlate with system events.

## Solution

5 new read-only tools.

### Logs (`src/tools/diagnostics.ts`)

| Tool | Endpoint | Notes |
|------|----------|-------|
| `opnsense_diag_log_system`   | `GET /diagnostics/log/core/system`   | Generic kernel/system log |
| `opnsense_diag_log_gateways` | `GET /diagnostics/log/core/gateways` | dpinger / gateway monitoring daemon |
| `opnsense_diag_log_routing`  | `GET /diagnostics/log/core/routing`  | Routing daemon |
| `opnsense_diag_log_resolver` | `GET /diagnostics/log/core/resolver` | Unbound DNS resolver |

Shared `LogQuerySchema`:
- `limit: z.number().int().min(1).max(5000).optional().default(500)`

### Gateway status (`src/tools/routing.ts`)

| Tool | Endpoint |
|------|----------|
| `opnsense_route_gateway_status` | `GET /routes/gateway/status` |

No params. Returns array of gateway monitor states (`name`, `status`, `loss`, `delay`, `stddev`, `monitor`, `monitor_disable`).

## Out of scope (follow-up issue)

- `opnsense_route_gateway_update` (write) — toggle `monitor_disable` and set monitor IP. The modern endpoint `/api/routes/gateway/set_item/{uuid}` may not be available on all OPNsense versions; needs an API spike against live 24.7 + 25.1.

## Execution Steps

1. Add `LogQuerySchema` and 4 log tool definitions/handlers to `src/tools/diagnostics.ts`
2. Add `opnsense_route_gateway_status` definition/handler to `src/tools/routing.ts`
3. Unit tests for all 5 tools (mocked client)
4. CHANGELOG entry, README tool tables, package.json version bump
5. Build + tests green; commit; PR; merge; tag; release per workflow

## Rollback

Tools are additive read-only. Revert PR if regression detected.

## Verification

- `npm test` green
- Live verification (separate, in infra repo): query gateway status on bifrost — confirm WAN_GW shows `monitor_disable: "1"`, then read gateway logs to see why monitoring was disabled.
