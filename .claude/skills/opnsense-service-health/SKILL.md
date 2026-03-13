---
name: opnsense-service-health
description: Dashboard-style health overview of the OPNsense firewall — system status, services, firmware, interfaces, DHCP
disable-model-invocation: true
---

# OPNsense Health Check (/health)

Produce a dashboard-style health overview of the OPNsense firewall.

## Workflow

### Step 1: Gather Data (run ALL in parallel)
1. `opnsense_sys_info` — system status (CPU, memory, uptime, disk)
2. `opnsense_svc_list` — all services and running status
3. `opnsense_firmware_status` — firmware version and available updates
4. `opnsense_firmware_info` — architecture and version details
5. `opnsense_if_stats` — interface traffic statistics
6. `opnsense_if_list` — interface name mappings
7. `opnsense_dhcp_list_leases` — active DHCP leases

### Step 2: Format Dashboard

Present results in this format:

```
## OPNsense Health Dashboard

### System
- Status: {OK/Warning/Critical}
- Uptime: {days/hours}
- CPU: {usage}%
- Memory: {used}/{total} ({percent}%)
- Disk: {used}/{total} ({percent}%)

### Firmware
- Version: {version}
- Architecture: {arch}
- Updates Available: {yes/no — details if yes}

### Services ({running}/{total} running)
| Service | Status |
|---------|--------|
| {name} | {Running/Stopped} |
(Highlight any stopped services that should be running)

### Interfaces
| Interface | Device | RX | TX | Errors |
|-----------|--------|----|----|--------|
| {name} | {device} | {bytes} | {bytes} | {count} |

### DHCP
- Active Leases: {count}
- Online: {count} | Offline: {count}
- Static Mappings: {count}
```

### Step 3: Highlight Issues
At the end, add a section if any issues were detected:
- Stopped services that are typically critical (unbound, configd, openssh)
- Firmware updates available
- Interface errors > 0
- System status not OK
- Disk usage > 80%

## Important
- This is a read-only health check — never modify configuration
- Run all data gathering in parallel for speed
- If a tool call fails, note it as "Unavailable" and continue with other checks
- Keep output concise — this is meant to be scanned quickly
