---
name: opnsense-diagnostics
description: Diagnose network connectivity issues using OPNsense firewall tools — ping, traceroute, DNS lookup, ARP, firewall states and logs
---

# OPNsense Network Diagnostics

Run a structured diagnostic workflow when the user reports connectivity issues, network problems, or asks to troubleshoot why a host can't be reached.

## Keywords
diagnose, connectivity, network issue, can't reach, troubleshoot, ping, traceroute, unreachable, timeout, blocked

## When to Use
- User says "diagnose connectivity to X" or "why can't I reach X"
- User reports a network issue or timeout
- User asks to troubleshoot a connection problem
- User asks "is X reachable from the firewall"

## Workflow

Execute these steps in order. Run independent checks in parallel where possible.

### Step 1: Identify the Target
Extract the target hostname or IP from the user's request. If ambiguous, ask for clarification.

### Step 2: Basic Connectivity (run in parallel)
1. **Ping** — `opnsense_diag_ping` with the target address (count: 3)
2. **DNS Lookup** — `opnsense_diag_dns_lookup` with the hostname (skip if target is an IP)
3. **Traceroute** — `opnsense_diag_traceroute` to the target

### Step 3: Local Network State (run in parallel)
1. **ARP Table** — `opnsense_diag_arp_table` — check if target has an ARP entry (local network)
2. **Firewall States** — `opnsense_diag_fw_states` — check for active connections to/from the target
3. **Routing Table** — `opnsense_diag_routes` — verify a route exists for the target

### Step 4: Firewall Logs
1. **Recent Logs** — `opnsense_diag_fw_logs` with limit 100 — filter for entries matching the target IP

### Step 5: Report

Present findings in this format:

```
## Diagnostic Report: {target}

### Connectivity
- Ping: {PASS/FAIL} — {latency or error}
- DNS: {PASS/FAIL/SKIP} — {resolved IP or error}
- Traceroute: {hops summary}

### Network State
- ARP Entry: {found/not found}
- Active FW States: {count matching target}
- Route: {matching route or "no route"}

### Firewall Logs
- Recent blocks matching target: {count}
- {details if blocks found}

### Assessment
{One paragraph summary: what's working, what's failing, likely root cause}

### Recommended Actions
- {Actionable next steps}
```

## Error Handling
- If a diagnostic tool returns an error (e.g., endpoint not found), note it in the report as "Unavailable" and continue with remaining checks
- Never skip the report — partial results are still valuable
- If the target is unreachable AND firewall blocks are found, highlight this as the likely cause
