# Manual Operations

Some OPNsense operations are not available via the REST API and require manual access through the web GUI. This document covers those operations and provides step-by-step instructions.

## Web GUI SSL Certificate Assignment

**Why manual?** OPNsense has no REST API endpoint to change the `ssl-certref` setting. The web GUI certificate is only configurable via `system_advanced_admin.php`, which uses session-based authentication (username/password + CSRF token) — incompatible with API key authentication.

### Prerequisites

- A valid certificate in the OPNsense trust store (e.g., issued via ACME/Let's Encrypt)
- Use `opnsense_sys_list_certs` to verify the certificate exists and note its description

### Steps

1. Open the OPNsense web GUI: `https://fw.example.com` (or `https://192.168.1.1`)
2. Navigate to **System > Settings > Administration**
3. Under **Web GUI > SSL Certificate**, select the desired certificate from the dropdown
4. Click **Save**
5. The web GUI will restart with the new certificate (expect a brief disconnection)

### Post-Assignment

After assigning a valid (non-self-signed) certificate:

1. Update your MCP configuration to enable SSL verification:
   ```json
   "OPNSENSE_VERIFY_SSL": "true"
   ```
2. Verify MCP connectivity by running any tool (e.g., `opnsense_sys_info`)

## Configuration Restore/Import

**Why manual?** The OPNsense `BackupController` API only supports:
- `GET /api/core/backup/download/this` — download current config XML
- `POST /api/core/backup/revertBackup/{file}` — revert to a local backup file already on the OPNsense filesystem

There is no API endpoint to upload or import a configuration XML file.

### Steps

1. Open the OPNsense web GUI
2. Navigate to **System > Configuration > Backups**
3. Use the **Restore** section to upload a configuration XML file
4. Review the changes and confirm the restore

## User/Group Management

**Why manual?** OPNsense does not expose user or group management via the REST API.

### Steps

1. Open the OPNsense web GUI
2. Navigate to **System > Access > Users** or **System > Access > Groups**
3. Create, modify, or delete users and groups as needed

## VPN Configuration

**Why manual?** OPNsense has limited API coverage for VPN settings. Most VPN configuration (OpenVPN, WireGuard, IPsec) requires the web GUI.

### Steps

1. Open the OPNsense web GUI
2. Navigate to **VPN** and select the appropriate VPN type
3. Configure tunnels, peers, and access rules through the GUI
