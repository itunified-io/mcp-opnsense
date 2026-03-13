import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";
import { ServiceActionSchema } from "../utils/validation.js";

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

const ServiceControlSchema = z.object({
  service_name: z.string().min(1, "Service name is required"),
  action: ServiceActionSchema,
});

const BackupRevertSchema = z.object({
  backup_id: z.string().min(1, "Backup ID is required (e.g. 'config-1773423430.7934.xml')"),
});

const BackupDownloadSchema = z.object({
  backup_id: z
    .string()
    .optional()
    .describe("Specific backup ID to download. If omitted, downloads the current running config."),
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
    name: "opnsense_sys_backup_list",
    description:
      "List all configuration backups stored on the OPNsense filesystem with timestamps, descriptions, and file sizes",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_sys_backup_download",
    description:
      "Download an OPNsense configuration backup as XML. Downloads the current running config if no backup_id is specified.",
    inputSchema: {
      type: "object" as const,
      properties: {
        backup_id: {
          type: "string",
          description:
            "Specific backup ID to download (e.g. 'config-1773423430.7934.xml'). Omit to download the current running config.",
        },
      },
    },
  },
  {
    name: "opnsense_sys_backup_revert",
    description:
      "Revert OPNsense configuration to a previous backup. DESTRUCTIVE: replaces the running config with the specified backup.",
    inputSchema: {
      type: "object" as const,
      properties: {
        backup_id: {
          type: "string",
          description:
            "Backup ID to revert to (e.g. 'config-1773423430.7934.xml'). Use opnsense_sys_backup_list to see available backups.",
        },
      },
      required: ["backup_id"],
    },
  },
  {
    name: "opnsense_sys_list_certs",
    description:
      "List all certificates in the OPNsense trust store with their refids, descriptions, and validity dates",
    inputSchema: { type: "object" as const, properties: {} },
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

      case "opnsense_sys_backup_list": {
        const result = await client.get("/core/backup/backups/this");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_sys_backup_download": {
        const parsed = BackupDownloadSchema.parse(args);
        const backupPath = parsed.backup_id
          ? `/core/backup/download/this/${encodeURIComponent(parsed.backup_id)}`
          : "/core/backup/download/this";
        const xml = await client.getRaw(backupPath);
        return { content: [{ type: "text", text: xml }] };
      }

      case "opnsense_sys_backup_revert": {
        const parsed = BackupRevertSchema.parse(args);
        const result = await client.post(
          `/core/backup/revertBackup/${encodeURIComponent(parsed.backup_id)}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_sys_list_certs": {
        const result = await client.get("/trust/cert/search");
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
