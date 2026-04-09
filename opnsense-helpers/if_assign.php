#!/usr/local/bin/php
<?php
/**
 * if_assign.php — assign an existing interface (VLAN / NIC) to a free opt slot.
 *
 * Used by mcp-opnsense (via SSH + sudo) to fill the gap in the OPNsense REST API,
 * which does not expose the legacy "Assign interfaces" page.
 *
 * Delivery: installed to /usr/local/opnsense/scripts/mcp/if_assign.php on the
 * target OPNsense host (mode 0755, root:wheel) and invoked only via a sudoers
 * whitelist drop-in (see mcp-opnsense README for the recommended pattern).
 *
 * Usage:
 *   sudo php -f /usr/local/opnsense/scripts/mcp/if_assign.php \
 *       --slot=<optN> --if=<device> [--descr=<text>]
 *
 * Examples:
 *   --slot=opt1 --if=vlan10 --descr="home VLAN"
 *   --slot=opt2 --if=vlan20 --descr="mgmt VLAN"
 *
 * Exit codes:
 *   0 success, assignment written and interface brought up
 *   1 invalid arguments
 *   2 slot already assigned
 *   3 unknown device (not in <vlans> and not a real NIC)
 *   4 write_config failed
 *   5 interfaces_configure failed
 *
 * Output: single JSON object on stdout.
 *
 * Source of truth: itunified-io/mcp-opnsense — opnsense-helpers/
 */

require_once("config.inc");
require_once("filter.inc");
require_once("system.inc");
require_once("interfaces.inc");
require_once("util.inc");

function out_json(array $obj): void
{
    echo json_encode($obj, JSON_UNESCAPED_SLASHES) . "\n";
}

function fail(int $code, string $msg, array $extra = []): void
{
    out_json(array_merge(["ok" => false, "error" => $msg], $extra));
    exit($code);
}

// --- 1. Parse argv ---
$opts = getopt("", ["slot:", "if:", "descr::"]);
if (empty($opts["slot"]) || empty($opts["if"])) {
    fail(1, "missing required arguments",
         ["usage" => "--slot=<optN> --if=<device> [--descr=<text>]"]);
}

$slot  = trim($opts["slot"]);
$ifdev = trim($opts["if"]);
$descr = isset($opts["descr"]) ? trim($opts["descr"]) : "";

// --- 2. Validate slot format ---
if (!preg_match('/^opt\d+$/', $slot)) {
    fail(1, "invalid slot format (expected optN)", ["slot" => $slot]);
}

// --- 3. Validate device format (safe subset) ---
if (!preg_match('/^(vlan\d+|[a-z]+\d+(_vlan\d+)?)$/', $ifdev)) {
    fail(1, "invalid device format", ["if" => $ifdev]);
}

// --- 4. Validate description charset (prevent XML injection) ---
if ($descr !== "" && !preg_match('/^[\w\s\-\.\,\(\)\#\:\/]{1,120}$/u', $descr)) {
    fail(1, "description contains disallowed characters", ["descr" => $descr]);
}

global $config;

// --- 5. Slot must not already exist ---
if (isset($config["interfaces"][$slot])) {
    fail(2, "slot already assigned",
         ["slot" => $slot,
          "current" => $config["interfaces"][$slot]["if"] ?? "?"]);
}

// --- 6. Device must exist as a VLAN or be a real NIC ---
$known_vlans = [];
if (isset($config["vlans"]["vlan"]) && is_array($config["vlans"]["vlan"])) {
    foreach ($config["vlans"]["vlan"] as $v) {
        if (isset($v["vlanif"])) {
            $known_vlans[] = $v["vlanif"];
        }
    }
}

$device_exists = in_array($ifdev, $known_vlans, true);
if (!$device_exists) {
    // Check if it's a real NIC (listed by kernel)
    $real_nics = get_interface_list();
    if (isset($real_nics[$ifdev])) {
        $device_exists = true;
    }
}

if (!$device_exists) {
    fail(3, "device not found in <vlans> and not a real NIC",
         ["if" => $ifdev, "known_vlans" => $known_vlans]);
}

// --- 7. Patch config.xml in memory ---
$config["interfaces"][$slot] = [
    "if"        => $ifdev,
    "enable"    => "1",
    "descr"     => $descr,
    "ipaddr"    => "none",
    "ipaddrv6"  => "none",
    "media"     => "",
    "mediaopt"  => "",
    "spoofmac"  => "",
];

// --- 8. Persist ---
$msg = "mcp-opnsense: assigned {$ifdev} to {$slot}" .
       ($descr !== "" ? " ({$descr})" : "");
if (!write_config($msg)) {
    fail(4, "write_config failed", ["slot" => $slot, "if" => $ifdev]);
}

// --- 9. Bring the slot up (enable the interface) ---
// interfaces_configure() writes progress messages to stdout ("Configuring ...done.")
// which would corrupt the single-JSON-object stdout contract. Buffer and discard.
ob_start();
try {
    interfaces_configure($slot);
    ob_end_clean();
} catch (Throwable $e) {
    ob_end_clean();
    fail(5, "interfaces_configure failed", [
        "slot"  => $slot,
        "error" => $e->getMessage(),
    ]);
}

// --- 10. Success ---
out_json([
    "ok"     => true,
    "slot"   => $slot,
    "if"     => $ifdev,
    "descr"  => $descr,
    "action" => "assigned_and_enabled",
]);
exit(0);
