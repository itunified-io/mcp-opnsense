---
name: opnsense-acme-renew
description: Check ACME certificate expiry and renew if needed — lists all certs, shows days remaining, triggers renewal
disable-model-invocation: true
---

# OPNsense ACME Certificate Renewal (/renew-cert)

Check ACME certificate status and renew certificates approaching expiry.

## Workflow

### Step 1: Gather Certificate Data (run in parallel)
1. `opnsense_acme_list_certs` — all ACME certificates with status and last update
2. `opnsense_sys_list_certs` — all certificates in the trust store with validity dates
3. `opnsense_acme_settings` — current ACME service settings (enabled, auto-renewal)

### Step 2: Analyze Expiry

For each ACME certificate:
1. Match it to its trust store entry by name/description
2. Calculate days remaining from `valid_to` timestamp
3. Categorize:
   - **Expired**: valid_to < now
   - **Critical**: < 7 days remaining
   - **Warning**: < 30 days remaining
   - **OK**: >= 30 days remaining

### Step 3: Renew if Needed

For certificates that are Expired, Critical, or Warning:
1. Ask the user for confirmation: "Certificate {name} expires in {days} days. Renew now?"
2. If confirmed: `opnsense_acme_renew_cert` with the certificate UUID
3. `opnsense_acme_apply` — apply changes
4. Wait a moment, then re-check with `opnsense_acme_list_certs` to verify renewal succeeded

### Step 4: Report

```
## ACME Certificate Status

### Service Settings
- ACME Enabled: {yes/no}
- Auto-Renewal: {enabled/disabled}
- Environment: {production/staging}

### Certificates
| Name | Status | Expires | Days Left | Last Renewed |
|------|--------|---------|-----------|-------------|
| {name} | {OK/Warning/Critical/Expired} | {date} | {days} | {date} |

### Actions Taken
- {cert name}: Renewed successfully / Renewal failed: {error} / No action needed
```

## Important
- ALWAYS ask for confirmation before renewing — renewal triggers a new ACME challenge
- If auto-renewal is disabled, suggest enabling it: `opnsense_acme_settings` with `autoRenewal: "1"`
- Let's Encrypt certs are valid for 90 days; renewal typically happens at 60 days
- The ACME cert renewal does NOT automatically update the web GUI SSL certificate — that requires a manual GUI step (System > Settings > Administration)
- If renewal fails, check: ACME account registered, DNS challenge configured, Cloudflare credentials valid
