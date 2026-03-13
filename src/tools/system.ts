import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";
import { ServiceActionSchema } from "../utils/validation.js";

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

const RestoreSchema = z.object({
  backup_data: z.string().min(1, "Backup data is required"),
  confirm: z.literal(true, {
    errorMap: () => ({ message: "confirm must be true to proceed with restore" }),
  }),
});

const ServiceControlSchema = z.object({
  service_name: z.string().min(1, "Service name is required"),
  action: ServiceActionSchema,
});

// ---------------------------------------------------------------------------
// Tool definitions (for ListTools)
// ---------------------------------------------------------------------------

export const systemToolDefinitions = [
  {
    name: "opnsense_sys_info",
    description:
      "Get system status information (hostname, versions, CPU, memory, uptime, disk usage)",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_sys_backup",
    description: "Create a configuration backup of the OPNsense system",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_sys_restore",
    description:
      "Restore a configuration backup. DESTRUCTIVE: replaces the current configuration. Requires explicit confirmation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        backup_data: {
          type: "string",
          description: "The backup XML data to restore",
        },
        confirm: {
          type: "boolean",
          description: "Must be true to confirm the restore operation",
          enum: [true],
        },
      },
      required: ["backup_data", "confirm"],
    },
  },
  {
    name: "opnsense_svc_list",
    description: "List all services and their running status",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_svc_control",
    description: "Start, stop, or restart a service by name",
    inputSchema: {
      type: "object" as const,
      properties: {
        service_name: {
          type: "string",
          description: "Name of the service (e.g. 'unbound', 'openssh', 'configd')",
        },
        action: {
          type: "string",
          enum: ["start", "stop", "restart"],
          description: "Action to perform on the service",
        },
      },
      required: ["service_name", "action"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function handleSystemTool(
  name: string,
  args: Record<string, unknown>,
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    switch (name) {
      case "opnsense_sys_info": {
        const result = await client.get("/core/system/status");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_sys_backup": {
        const result = await client.post("/core/backup/backup");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_sys_restore": {
        const parsed = RestoreSchema.parse(args);
        const result = await client.post("/core/backup/restore", {
          backupdata: parsed.backup_data,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_svc_list": {
        const result = await client.get("/core/service/search");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_svc_control": {
        const parsed = ServiceControlSchema.parse(args);
        const result = await client.post(
          `/core/service/${parsed.action}/${encodeURIComponent(parsed.service_name)}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown system tool: ${name}` }],
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${message}` }],
    };
  }
}
