#!/usr/local/bin/php
<?php
/**
 * if_configure.php — configure IPv4/IPv6 settings on an already-assigned opt slot.
 *
 * Used by mcp-opnsense (via SSH + sudo) to set IP addresses on interfaces that
 * were already assigned via if_assign.php or through the legacy Web UI.
 *
 * Delivery: installed to /usr/local/opnsense/scripts/mcp/if_configure.php on the
 * target OPNsense host (mode 0755, root:wheel) and invoked only via a sudoers
 * whitelist drop-in (see mcp-opnsense README for the recommended pattern).
 *
 * Usage:
 *   sudo php -f /usr/local/opnsense/scripts/mcp/if_configure.php \
 *       --slot=<optN> \
 *       [--ipv4=<addr|none|dhcp>] [--subnet=<n>] \
 *       [--ipv6=<addr|none|dhcp6|track6>] [--subnetv6=<n>] \
 *       [--track6-interface=<wan>] [--track6-prefix-id=<n>] \
 *       [--descr=<text>] \
 *       [--no-filter-reload]
 *
 * Examples:
 *   --slot=opt2 --ipv4=192.0.2.1 --subnet=24 --descr="example VLAN"
 *   --slot=opt1 --ipv4=198.51.100.1 --subnet=24 --ipv6=track6 --subnetv6=64 \
 *               --track6-interface=wan --track6-prefix-id=1
 *
 * Exit codes:
 *   0 success
 *   1 invalid arguments
 *   2 slot not assigned
 *   3 validation failed (IP/CIDR format)
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
$opts = getopt("", [
    "slot:",
    "ipv4::", "subnet::",
    "ipv6::", "subnetv6::",
    "track6-interface::", "track6-prefix-id::",
    "descr::",
    "no-filter-reload",
]);

if (empty($opts["slot"])) {
    fail(1, "missing required argument --slot",
         ["usage" => "--slot=<optN> [--ipv4=...] [--subnet=...] [--ipv6=...] [...]"]);
}

$slot = trim($opts["slot"]);
if (!preg_match('/^opt\d+$/', $slot)) {
    fail(1, "invalid slot format (expected optN)", ["slot" => $slot]);
}

global $config;

// --- 2. Slot must exist ---
if (!isset($config["interfaces"][$slot])) {
    fail(2, "slot not assigned — run if_assign.php first", ["slot" => $slot]);
}

// --- 3. Validate IPv4 ---
$ipv4   = isset($opts["ipv4"])   ? trim($opts["ipv4"])   : null;
$subnet = isset($opts["subnet"]) ? trim($opts["subnet"]) : null;

if ($ipv4 !== null && $ipv4 !== "" && $ipv4 !== "none" && $ipv4 !== "dhcp") {
    if (!filter_var($ipv4, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        fail(3, "invalid IPv4 address", ["ipv4" => $ipv4]);
    }
    if ($subnet === null || !ctype_digit($subnet) ||
        (int)$subnet < 0 || (int)$subnet > 32) {
        fail(3, "invalid --subnet for static IPv4 (0..32)",
             ["subnet" => $subnet]);
    }
}

// --- 4. Validate IPv6 ---
$ipv6     = isset($opts["ipv6"])     ? trim($opts["ipv6"])     : null;
$subnetv6 = isset($opts["subnetv6"]) ? trim($opts["subnetv6"]) : null;
$track6if = isset($opts["track6-interface"]) ? trim($opts["track6-interface"]) : null;
$track6id = isset($opts["track6-prefix-id"]) ? trim($opts["track6-prefix-id"]) : null;

$ipv6_is_literal = ($ipv6 !== null && $ipv6 !== "" && $ipv6 !== "none" &&
                    $ipv6 !== "dhcp6" && $ipv6 !== "track6");
if ($ipv6_is_literal) {
    if (!filter_var($ipv6, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        fail(3, "invalid IPv6 address", ["ipv6" => $ipv6]);
    }
    if ($subnetv6 === null || !ctype_digit($subnetv6) ||
        (int)$subnetv6 < 0 || (int)$subnetv6 > 128) {
        fail(3, "invalid --subnetv6 for static IPv6 (0..128)",
             ["subnetv6" => $subnetv6]);
    }
}

if ($ipv6 === "track6") {
    if ($track6if === null ||
        !preg_match('/^(wan|opt\d+|lan)$/', $track6if)) {
        fail(3, "track6 requires --track6-interface=<parent>",
             ["track6-interface" => $track6if]);
    }
    if ($track6id !== null && !ctype_digit($track6id)) {
        fail(3, "--track6-prefix-id must be numeric", ["track6-prefix-id" => $track6id]);
    }
}

// --- 5. Validate description ---
$descr = isset($opts["descr"]) ? trim($opts["descr"]) : null;
if ($descr !== null && $descr !== "" &&
    !preg_match('/^[\w\s\-\.\,\(\)\#\:\/]{1,120}$/u', $descr)) {
    fail(1, "description contains disallowed characters", ["descr" => $descr]);
}

// --- 6. Patch config in memory ---
$iface =& $config["interfaces"][$slot];

if ($ipv4 !== null) {
    if ($ipv4 === "none" || $ipv4 === "") {
        $iface["ipaddr"] = "none";
        unset($iface["subnet"]);
    } elseif ($ipv4 === "dhcp") {
        $iface["ipaddr"] = "dhcp";
        unset($iface["subnet"]);
    } else {
        $iface["ipaddr"] = $ipv4;
        $iface["subnet"] = $subnet;
    }
}

if ($ipv6 !== null) {
    if ($ipv6 === "none" || $ipv6 === "") {
        $iface["ipaddrv6"] = "none";
        unset($iface["subnetv6"], $iface["track6-interface"], $iface["track6-prefix-id"]);
    } elseif ($ipv6 === "dhcp6") {
        $iface["ipaddrv6"] = "dhcp6";
        unset($iface["subnetv6"], $iface["track6-interface"], $iface["track6-prefix-id"]);
    } elseif ($ipv6 === "track6") {
        $iface["ipaddrv6"] = "track6";
        $iface["track6-interface"] = $track6if;
        if ($track6id !== null) {
            $iface["track6-prefix-id"] = $track6id;
        }
        unset($iface["subnetv6"]);
    } else {
        $iface["ipaddrv6"] = $ipv6;
        $iface["subnetv6"] = $subnetv6;
        unset($iface["track6-interface"], $iface["track6-prefix-id"]);
    }
}

if ($descr !== null) {
    $iface["descr"] = $descr;
}

// --- 7. Persist ---
$summary = "mcp-opnsense: configured {$slot}";
if ($ipv4 !== null)  { $summary .= " ipv4={$ipv4}" . ($subnet !== null ? "/{$subnet}" : ""); }
if ($ipv6 !== null)  { $summary .= " ipv6={$ipv6}"; }
if ($descr !== null) { $summary .= " descr=\"{$descr}\""; }

if (!write_config($summary)) {
    fail(4, "write_config failed", ["slot" => $slot]);
}

// --- 8. Apply ---
// interfaces_configure() + filter_configure() both write progress to stdout,
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

if (!isset($opts["no-filter-reload"])) {
    ob_start();
    try {
        filter_configure();
        ob_end_clean();
    } catch (Throwable $e) {
        ob_end_clean();
        // Non-fatal: config wrote OK, interface up, only filter reload failed
        out_json([
            "ok"       => true,
            "slot"     => $slot,
            "warning"  => "filter_configure failed: " . $e->getMessage(),
            "action"   => "configured_without_filter_reload",
        ]);
        exit(0);
    }
}

// --- 9. Success ---
out_json([
    "ok"      => true,
    "slot"    => $slot,
    "ipv4"    => $iface["ipaddr"]   ?? null,
    "subnet"  => $iface["subnet"]   ?? null,
    "ipv6"    => $iface["ipaddrv6"] ?? null,
    "subnetv6"=> $iface["subnetv6"] ?? null,
    "descr"   => $iface["descr"]    ?? null,
    "action"  => "configured_and_applied",
]);
exit(0);
