import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

const PackageSchema = z.object({
  package: z.string().min(1, "Package name is required"),
});

const RemovePackageSchema = z.object({
  package: z.string().min(1, "Package name is required"),
  confirm: z.literal(true, {
    errorMap: () => ({ message: "confirm must be true to proceed with package removal" }),
  }),
});

const UpgradeSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: "confirm must be true to proceed with the system upgrade" }),
  }),
});

const RebootSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: "confirm must be true to proceed with the reboot" }),
  }),
});

// ---------------------------------------------------------------------------
// Tool definitions (for ListTools)
// ---------------------------------------------------------------------------

export const firmwareToolDefinitions = [
  {
    name: "opnsense_firmware_info",
    description:
      "Get firmware version, architecture, and update status of the OPNsense system",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_firmware_status",
    description:
      "Check for available firmware upgrades and their status (running, pending, done). Reads the cached state — call 'opnsense_firmware_check' first if the cache may be stale.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_firmware_check",
    description:
      "Trigger a background firmware repository check to refresh the cached upgrade status. After calling this, wait briefly and then call 'opnsense_firmware_status' to see fresh upgrade info.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_firmware_list_plugins",
    description:
      "List all available and installed OPNsense plugins with their versions and status",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_firmware_install",
    description:
      "Install an OPNsense plugin package by name (e.g. 'os-acme-client'). May require a service restart.",
    inputSchema: {
      type: "object" as const,
      properties: {
        package: {
          type: "string",
          description: "Plugin package name (e.g. 'os-acme-client', 'os-haproxy')",
        },
      },
      required: ["package"],
    },
  },
  {
    name: "opnsense_firmware_remove",
    description:
      "Remove an installed OPNsense plugin package. DESTRUCTIVE: requires explicit confirmation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        package: {
          type: "string",
          description: "Plugin package name to remove",
        },
        confirm: {
          type: "boolean",
          description: "Must be true to confirm the removal",
          enum: [true],
        },
      },
      required: ["package", "confirm"],
    },
  },
  {
    name: "opnsense_firmware_upgrade",
    description:
      "Trigger an OPNsense system upgrade based on what 'opnsense_firmware_status' reports (minor packages, or a major-series jump such as 24.7 → 25.1). Long-running: poll progress with 'opnsense_firmware_upgrade_status'. A reboot is typically required afterwards. DESTRUCTIVE: requires explicit confirmation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        confirm: {
          type: "boolean",
          description: "Must be true to confirm the upgrade",
          enum: [true],
        },
      },
      required: ["confirm"],
    },
  },
  {
    name: "opnsense_firmware_upgrade_status",
    description:
      "Get the progress/log of a currently running or last completed firmware upgrade (long-running operation status).",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_firmware_reboot",
    description:
      "Reboot the OPNsense system. Causes a network outage on the firewall and any services it provides (DNS, DHCP, VPN). DESTRUCTIVE: requires explicit confirmation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        confirm: {
          type: "boolean",
          description: "Must be true to confirm the reboot",
          enum: [true],
        },
      },
      required: ["confirm"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function handleFirmwareTool(
  name: string,
  args: Record<string, unknown>,
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    switch (name) {
      case "opnsense_firmware_info": {
        const result = await client.get("/core/firmware/info");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_firmware_status": {
        const result = await client.get("/core/firmware/status");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_firmware_check": {
        const result = await client.post("/core/firmware/check");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_firmware_list_plugins": {
        const result = await client.get("/core/firmware/info");
        const info = result as Record<string, unknown>;
        const plugins = (info.package ?? info.plugin ?? []) as unknown[];
        return { content: [{ type: "text", text: JSON.stringify(plugins, null, 2) }] };
      }

      case "opnsense_firmware_install": {
        const parsed = PackageSchema.parse(args);
        const result = await client.post("/core/firmware/install/" + encodeURIComponent(parsed.package));
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_firmware_remove": {
        const parsed = RemovePackageSchema.parse(args);
        const result = await client.post("/core/firmware/remove/" + encodeURIComponent(parsed.package));
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_firmware_upgrade": {
        UpgradeSchema.parse(args);
        const result = await client.post("/core/firmware/upgrade");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_firmware_upgrade_status": {
        const result = await client.get("/core/firmware/upgradestatus");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_firmware_reboot": {
        RebootSchema.parse(args);
        const result = await client.post("/core/firmware/reboot");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown firmware tool: ${name}` }],
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${message}` }],
    };
  }
}
