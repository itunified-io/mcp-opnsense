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

// FreeBSD sysctl name pattern: hierarchical dot-separated identifiers
// e.g. "dev.em.0.eee_control", "net.inet.tcp.recvspace", "kern.ipc.somaxconn"
const TunableNameSchema = z
  .string()
  .min(1, "Tunable name is required")
  .regex(
    /^[A-Za-z0-9_.]+$/,
    "Tunable name must be a FreeBSD sysctl identifier (alphanumeric + dot + underscore)",
  );

const TunableGetSchema = z.object({
  tunable: TunableNameSchema.describe(
    "FreeBSD sysctl name (e.g. 'dev.em.0.eee_control', 'net.inet.tcp.recvspace')",
  ),
});

const TunableSetSchema = z.object({
  tunable: TunableNameSchema.describe("FreeBSD sysctl name (e.g. 'dev.em.0.eee_control')"),
  value: z
    .string()
    .min(1, "Tunable value is required")
    .describe("Value to set (numbers and strings are both passed as strings, matching OPNsense API)"),
  descr: z
    .string()
    .optional()
    .describe("Optional description / rationale (visible in OPNsense UI)"),
  apply: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Apply the change immediately by calling reconfigure (default: true). Set false to batch multiple updates.",
    ),
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
  {
    name: "opnsense_sys_tunable_list",
    description:
      "List all configured FreeBSD sysctl tunables on OPNsense (System → Settings → Tunables). Returns tunable name, configured value, UUID, description. Use opnsense_sys_tunable_get to inspect a specific one.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_sys_tunable_get",
    description:
      "Get a single configured tunable by sysctl name (e.g. 'dev.em.0.eee_control'). Returns the configured value, UUID, and description. Returns null if the tunable is not configured.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tunable: {
          type: "string",
          description:
            "FreeBSD sysctl name (e.g. 'dev.em.0.eee_control', 'net.inet.tcp.recvspace', 'kern.ipc.somaxconn')",
        },
      },
      required: ["tunable"],
    },
  },
  {
    name: "opnsense_sys_tunable_set",
    description:
      "Upsert a FreeBSD sysctl tunable on OPNsense (creates if missing, updates if existing). Persists across reboots via OPNsense config. By default automatically applies the change via reconfigure. Useful for hardware quirks (e.g. dev.em.0.eee_control=0 to disable EEE), performance tuning, or kernel parameter overrides.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tunable: {
          type: "string",
          description: "FreeBSD sysctl name (e.g. 'dev.em.0.eee_control')",
        },
        value: {
          type: "string",
          description:
            "Value to set (numbers and strings are both passed as strings, matching OPNsense API)",
        },
        descr: {
          type: "string",
          description: "Optional description / rationale (visible in OPNsense UI)",
        },
        apply: {
          type: "boolean",
          description:
            "Apply the change immediately by calling reconfigure (default: true). Set false to batch multiple updates and apply later.",
          default: true,
        },
      },
      required: ["tunable", "value"],
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TunableRow {
  uuid?: string;
  tunable?: string;
  value?: string;
  descr?: string;
  [key: string]: unknown;
}

interface SearchTunableResponse {
  rows?: TunableRow[];
  total?: number;
  rowCount?: number;
  current?: number;
}

/**
 * Look up a configured tunable by its FreeBSD sysctl name (e.g. "dev.em.0.eee_control").
 * Returns the matching row including its UUID, or null if not found.
 *
 * OPNsense's searchTunable returns all configured tunables; we filter client-side
 * because the API has no exact-match-by-name query parameter.
 */
async function findTunableByName(
  client: OPNsenseClient,
  name: string,
): Promise<TunableRow | null> {
  const result = await client.post<SearchTunableResponse>("/system/settings/searchTunable", {});
  const rows = result.rows ?? [];
  const match = rows.find((row) => row.tunable === name);
  return match ?? null;
}

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

      case "opnsense_sys_tunable_list": {
        // OPNsense convention: search* endpoints accept POST with optional pagination body.
        // An empty body returns all rows with default pagination.
        const result = await client.post("/system/settings/searchTunable", {});
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_sys_tunable_get": {
        const parsed = TunableGetSchema.parse(args);
        const found = await findTunableByName(client, parsed.tunable);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                found ?? { tunable: parsed.tunable, configured: false, message: "Tunable is not configured (using FreeBSD default)" },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "opnsense_sys_tunable_set": {
        const parsed = TunableSetSchema.parse(args);
        const existing = await findTunableByName(client, parsed.tunable);

        const body = {
          tunable: {
            tunable: parsed.tunable,
            value: parsed.value,
            descr: parsed.descr ?? "",
          },
        };

        let mutationResult: unknown;
        let action: "added" | "updated";

        if (existing && typeof existing === "object" && "uuid" in existing && existing.uuid) {
          action = "updated";
          mutationResult = await client.post(
            `/system/settings/setTunable/${encodeURIComponent(String(existing.uuid))}`,
            body,
          );
        } else {
          action = "added";
          mutationResult = await client.post("/system/settings/addTunable", body);
        }

        let applyResult: unknown = null;
        if (parsed.apply !== false) {
          applyResult = await client.post("/system/settings/reconfigure");
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  action,
                  tunable: parsed.tunable,
                  value: parsed.value,
                  applied: parsed.apply !== false,
                  mutation: mutationResult,
                  apply: applyResult,
                },
                null,
                2,
              ),
            },
          ],
        };
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
