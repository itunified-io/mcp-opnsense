# OPNsense PHP helpers

Server-side PHP scripts that mcp-opnsense invokes over SSH + sudo for operations
the OPNsense REST API does not expose.

## Why

The OPNsense REST API covers most infrastructure operations, but a few legacy
pages have no API equivalent. The most notable gap is **Interfaces →
Assignments**: there is no REST endpoint to bind a VLAN or NIC device to a
free `optN` slot, which is a prerequisite for configuring an IP on it.

These helpers fill that gap. They live inside mcp-opnsense so that the tool and
the remote script that implements it are versioned and released together.

## Files

| File | Purpose |
|------|---------|
| `if_assign.php` | Assign an existing VLAN or NIC device to a free `optN` slot |
| `if_configure.php` | Set IPv4/IPv6 on an already-assigned `optN` slot (static, dhcp, dhcp6, track6, none) |

Both helpers:

- Require OPNsense 24.x or later (tested on 24.7)
- Must be run as root (typically via `sudo`)
- Emit a single JSON object on stdout
- Use numbered exit codes (see the file-level docblock in each script)

## Install

On the target OPNsense host:

```sh
sudo mkdir -p /usr/local/opnsense/scripts/mcp
sudo install -m 0755 -o root -g wheel if_assign.php    /usr/local/opnsense/scripts/mcp/
sudo install -m 0755 -o root -g wheel if_configure.php /usr/local/opnsense/scripts/mcp/
```

## Sudoers whitelist (recommended)

Create `/usr/local/etc/sudoers.d/mcp_opnsense` (mode `0440`, owner `root:wheel`)
to authorize the mcp-opnsense user without requiring a blanket wheel NOPASSWD
grant:

```
Defaults:<user>    !lecture, !authenticate, !requiretty, env_reset
<user> ALL=(root) NOPASSWD: \
    /usr/local/sbin/configctl interface reconfigure, \
    /usr/local/sbin/configctl filter reload, \
    /usr/local/bin/php -f /usr/local/opnsense/scripts/mcp/if_assign.php *, \
    /usr/local/bin/php -f /usr/local/opnsense/scripts/mcp/if_configure.php *, \
    /bin/cat /conf/config.xml
```

Replace `<user>` with the login name mcp-opnsense uses for SSH. Validate with
`visudo -c -f /usr/local/etc/sudoers.d/mcp_opnsense` before leaving the host.

## Security

- The helpers validate every argument (slot format, device format, description
  charset, IP address, CIDR range) before touching `$config`
- The description charset is restricted to prevent XML injection into
  `config.xml`
- Only pre-existing VLANs (from `<vlans>`) or real NICs (from
  `get_interface_list()`) may be assigned — there is no free-form device input
  path
- The helpers never read credentials, tokens, or secrets
