---
name: opnsense-dns-management
description: Manage OPNsense DNS host overrides — add, list, delete records and verify resolution
---

# OPNsense DNS Management

Orchestrate DNS record management on OPNsense Unbound with verification.

## Keywords
DNS, record, hostname, override, add DNS, delete DNS, manage DNS, host override, A record, CNAME

## When to Use
- User asks to add, modify, or delete a DNS record
- User asks to set up a hostname on the firewall
- User asks to list current DNS overrides
- User asks to block or unblock a domain

## Workflow

### Adding a DNS Record

#### Step 1: Gather Parameters
Required: hostname, domain, target IP (or CNAME target)
Optional: record type (A, AAAA, CNAME — default A), description

If the user says "point myserver.home.lab to 10.10.0.100", extract:
- hostname: `myserver`
- domain: `home.lab`
- server: `10.10.0.100`
- type: `A`

#### Step 2: Check Existing Records
Run `opnsense_dns_list_overrides` to check for conflicts:
- Same hostname+domain already exists — warn user, ask if they want to update (delete old + add new)
- Different hostname pointing to same IP — inform user (not necessarily a conflict)

#### Step 3: Create the Record
Run `opnsense_dns_add_override` with the gathered parameters.

#### Step 4: Apply Changes
Run `opnsense_dns_apply` to reconfigure Unbound. This is MANDATORY — changes don't take effect without it.

#### Step 5: Verify
Run `opnsense_diag_dns_lookup` with the full hostname to confirm resolution.
If the lookup tool is unavailable, note that verification should be done manually.

#### Step 6: Report
```
DNS Record Created:
  {hostname}.{domain} -> {server} ({type})
  Applied: Yes
  Verified: {Yes — resolves to {IP} / No — lookup failed / Manual verification needed}
```

### Deleting a DNS Record

#### Step 1: Find the Record
Run `opnsense_dns_list_overrides` and find the matching record by hostname/domain.
If not found, inform the user.

#### Step 2: Confirm with User
Show the record details and ask for confirmation before deleting.

#### Step 3: Delete
Run `opnsense_dns_delete_override` with the UUID.

#### Step 4: Apply
Run `opnsense_dns_apply`.

#### Step 5: Report
```
DNS Record Deleted:
  {hostname}.{domain} (UUID: {uuid})
  Applied: Yes
```

### Listing DNS Records
Run `opnsense_dns_list_overrides` and format as a table:
```
| Hostname | Domain | Target | Type | UUID |
|----------|--------|--------|------|------|
```

### Domain Blocking/Unblocking
- Block: `opnsense_dns_block_domain` then `opnsense_dns_apply`
- Unblock: find UUID via `opnsense_dns_list_blocklist` then `opnsense_dns_unblock_domain` then `opnsense_dns_apply`

## Important
- ALWAYS run `opnsense_dns_apply` after any changes — without it, changes are staged but not active
- Deleting a record requires the UUID — always list first to find it
- Ask for confirmation before deleting records
