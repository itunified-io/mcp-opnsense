---
name: opnsense-firewall-audit
description: Audit OPNsense firewall rules for security issues — overly permissive rules, disabled rules, unused aliases
---

# OPNsense Firewall Audit

Perform a security audit of the OPNsense firewall configuration.

## Keywords
audit, firewall, review rules, security check, firewall review, permissive, rules audit, security audit

## When to Use
- User asks to audit or review firewall rules
- User asks for a security check of the firewall
- User wants to know if any rules are too permissive
- User asks about firewall configuration quality

## Workflow

### Step 1: Gather Firewall Configuration (run in parallel)
1. `opnsense_fw_list_rules` — all filter rules
2. `opnsense_fw_list_aliases` — all aliases (host groups, networks, ports)

### Step 2: Analyze Rules

Check for these security concerns:

**Critical**
- Rules with source=any AND destination=any AND action=pass (allow-all)
- Rules with protocol=any AND no port restrictions
- Pass rules on WAN interface with no source restrictions

**Warning**
- Disabled rules that were previously active (may indicate incomplete cleanup)
- Rules with very broad source/destination (e.g., entire /8 networks)
- Multiple rules that could be consolidated into alias-based rules

**Info**
- Total rule count per interface
- Rules without descriptions (poor documentation)
- Alias usage vs inline addresses

### Step 3: Check Active State
1. `opnsense_diag_fw_states` — active connection states (look for unexpected connections)
2. `opnsense_diag_fw_logs` (limit: 200) — recent blocks (look for patterns)

### Step 4: Report

```
## Firewall Audit Report

### Summary
- Total rules: {count}
- Enabled: {count} | Disabled: {count}
- Aliases: {count}
- Active states: {count}

### Critical Findings
{List critical issues with rule details and remediation}

### Warnings
{List warnings with context}

### Informational
{List info items}

### Blocked Traffic Patterns (Last 200 Entries)
- Top blocked sources: {list}
- Top blocked destinations: {list}
- Top blocked ports: {list}

### Recommendations
1. {Prioritized action items}
```

## Important
- This skill is READ-ONLY — it never modifies firewall rules
- If the user asks to fix an issue found during audit, switch to manual rule management (not this skill)
- Present findings objectively — let the user decide on remediation
- An empty rule set is not necessarily a problem (OPNsense has implicit deny-all)
