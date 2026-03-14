---
name: opn-test
description: Live integration test for all OPNsense MCP tools — read + safe writes with cleanup
disable-model-invocation: true
---

# OPNsense Live Test (/opn-test)

Run live integration tests against the OPNsense API to verify all MCP tools work correctly.

**Usage:** `/opn-test` (all domains) or `/opn-test <domain>` (single domain)
**Available domains:** dns, firewall, acme, diagnostics, system, dhcp, interfaces, firmware

## Test Protocol

### For each test:
1. Call the MCP tool with test parameters
2. Verify the response is valid (no errors, expected structure)
3. For WRITE tests: verify the entry was created, then CLEANUP and verify removal
4. Record result: PASS / FAIL / SKIP / ERROR

### Bug Handling
If a tool returns an unexpected error or wrong data:
1. Record the failure with: tool name, input params, expected vs actual result
2. Create a GitHub issue in this repo with label `bug` including the failure details
3. Continue testing remaining tools — do NOT stop on first failure

### Cleanup Rules
- All WRITE tests MUST have a matching CLEANUP step
- Test entries use prefix `mcp-test` or `MCP-TEST` for easy identification
- After all tests in a domain: verify NO test entries remain
- If cleanup fails: report as CRITICAL in results and attempt manual cleanup

## Test Matrix

### DNS Domain (domain: `dns`)

**Read tests:**
1. `opnsense_dns_list_overrides` — expect array response
2. `opnsense_dns_list_forwards` — expect array response
3. `opnsense_dns_list_blocklist` — expect array response
4. `opnsense_dns_diagnostics` — expect diagnostics data

**Write + Cleanup cycle — Host Override:**
5. `opnsense_dns_add_override` — add host `mcp-test`, domain `home.lab`, ip `10.10.99.99`, description `MCP-TEST`
6. `opnsense_dns_list_overrides` — VERIFY: confirm `mcp-test.home.lab` appears in list
7. `opnsense_dns_delete_override` — CLEANUP: delete by UUID from step 5
8. `opnsense_dns_list_overrides` — VERIFY: confirm `mcp-test.home.lab` is gone

**Write + Cleanup cycle — Forward:**
9. `opnsense_dns_add_forward` — add forward for domain `mcp-test-fwd.example.com`, server `1.1.1.1`
10. `opnsense_dns_delete_forward` — CLEANUP: delete by UUID from step 9

**Write + Cleanup cycle — Blocklist:**
11. `opnsense_dns_block_domain` — block `mcp-test-block.example.com`
12. `opnsense_dns_unblock_domain` — CLEANUP: unblock `mcp-test-block.example.com`

**Safe write (no cleanup needed):**
13. `opnsense_dns_flush_cache` — flush DNS cache

**SKIP:** `opnsense_dns_apply` — would apply pending DNS changes to live config

### Firewall Domain (domain: `firewall`)

**Read tests:**
1. `opnsense_fw_list_rules` — expect array response
2. `opnsense_fw_list_aliases` — expect array response

**Write + Cleanup cycle — Rule:**
3. `opnsense_fw_add_rule` — add DISABLED test rule: action `block`, interface `lan`, source_net `any`, destination_net `any`, description `MCP-TEST-RULE`, disabled `true`
4. `opnsense_fw_list_rules` — VERIFY: confirm `MCP-TEST-RULE` appears
5. `opnsense_fw_toggle_rule` — toggle the test rule (verifies toggle mechanism)
6. `opnsense_fw_update_rule` — update description to `MCP-TEST-RULE-UPDATED`
7. `opnsense_fw_delete_rule` — CLEANUP: delete test rule
8. `opnsense_fw_list_rules` — VERIFY: confirm test rule is gone

**SKIP:** `opnsense_fw_apply` — would apply rules to live firewall
**SKIP:** `opnsense_fw_manage_alias` — test separately if needed

### ACME Domain (domain: `acme`)

**Read tests only** (all write operations involve real Let's Encrypt or destructive actions):
1. `opnsense_acme_settings` — get ACME settings
2. `opnsense_acme_list_accounts` — list accounts
3. `opnsense_acme_list_challenges` — list challenges
4. `opnsense_acme_list_certs` — list certificates

**SKIP:** All other ACME tools (add/delete account, register, add/update/delete challenge, create/delete/renew cert, apply)

### Diagnostics Domain (domain: `diagnostics`)

**Read tests:**
1. `opnsense_diag_system_info` — get system info
2. `opnsense_diag_arp_table` — get ARP table
3. `opnsense_diag_routes` — get routing table
4. `opnsense_diag_fw_states` — get firewall states
5. `opnsense_diag_fw_logs` — get firewall logs (limit to 10)
6. `opnsense_diag_ping` — ping gateway (use the firewall's own IP from sys_info)
7. `opnsense_diag_traceroute` — traceroute to `1.1.1.1`
8. `opnsense_diag_dns_lookup` — reverse lookup for the firewall's own IP
9. `opnsense_diag_reverse_dns` — reverse DNS for the firewall's own IP

### System Domain (domain: `system`)

**Read tests:**
1. `opnsense_sys_info` — get system info
2. `opnsense_sys_backup_list` — list backups
3. `opnsense_sys_backup_download` — download current config (verify response contains XML)
4. `opnsense_sys_list_certs` — list certificates
5. `opnsense_svc_list` — list all services

**SKIP:** `opnsense_svc_control` — would restart live services
**SKIP:** `opnsense_sys_backup_revert` — destructive

### DHCP Domain (domain: `dhcp`)

**Read tests:**
1. `opnsense_dhcp_list_leases` — list active leases
2. `opnsense_dhcp_find_lease` — find a lease (use first MAC from lease list)
3. `opnsense_dhcp_list_static` — list static mappings

**Write + Cleanup cycle — Static Mapping:**
4. `opnsense_dhcp_add_static` — add static mapping: mac `00:00:5E:00:53:01`, ipaddr `10.10.99.98`, hostname `MCP-TEST`, description `MCP live test entry`
5. `opnsense_dhcp_list_static` — VERIFY: confirm `MCP-TEST` appears
6. `opnsense_dhcp_delete_static` — CLEANUP: delete by UUID from step 4
7. `opnsense_dhcp_list_static` — VERIFY: confirm `MCP-TEST` is gone

### Interfaces Domain (domain: `interfaces`)

**Read tests:**
1. `opnsense_if_list` — list interfaces
2. `opnsense_if_get` — get details for `lan` interface
3. `opnsense_if_stats` — get interface statistics

### Firmware Domain (domain: `firmware`)

**Read tests:**
1. `opnsense_firmware_info` — get firmware info
2. `opnsense_firmware_status` — check for updates
3. `opnsense_firmware_list_plugins` — list installed plugins

**SKIP:** `opnsense_firmware_install` — would install package
**SKIP:** `opnsense_firmware_remove` — would remove package

## Results Dashboard

After all tests complete, present results in this format:

```
## OPNsense Live Test Results — [DATE]

### Summary
- Total tools: 63
- Tested: [N] | Skipped: [N]
- PASS: [N] | FAIL: [N] | ERROR: [N]
- Write+Cleanup cycles: [N] completed, [N] failed
- Bugs created: [N] (list issue URLs)

### Per Domain
| Domain | Tools | Tested | Pass | Fail | Skip |
|--------|-------|--------|------|------|------|
| DNS | 12 | ... | ... | ... | ... |
| Firewall | 8 | ... | ... | ... | ... |
| ACME | 14 | ... | ... | ... | ... |
| Diagnostics | 9 | ... | ... | ... | ... |
| System | 7 | ... | ... | ... | ... |
| DHCP | 5 | ... | ... | ... | ... |
| Interfaces | 3 | ... | ... | ... | ... |
| Firmware | 5 | ... | ... | ... | ... |

### Failures (if any)
| Tool | Input | Expected | Actual | Issue |
|------|-------|----------|--------|-------|
| ... | ... | ... | ... | #XX |

### Cleanup Status
- [ ] All test entries removed
- [ ] No `mcp-test` / `MCP-TEST` entries remain in any domain
```

## Slack Reporting

Post a concise summary to Slack (channel provided by the caller):

```
🧪 OPNsense Live Test — [DATE]
Tested: [N]/63 | ✅ [N] Pass | ❌ [N] Fail | ⏭️ [N] Skip
Write+Cleanup: [N]/[N] clean
Bugs: [N] created ([issue URLs])
```

## Important
- This is a TEST skill — it creates and deletes test entries. Never leave test data behind.
- Use `mcp-test` / `MCP-TEST` prefix for ALL test entries so they're easily identifiable.
- Do NOT call `opnsense_dns_apply` or `opnsense_fw_apply` — test entries should NOT be applied to live config.
- If a CLEANUP step fails, try again. If it still fails, report as CRITICAL.
- The firewall test rule MUST be created as DISABLED to prevent any traffic impact.
