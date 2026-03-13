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

const SetWebguiCertSchema = z.object({
  cert_refid: z.string().min(1, "Certificate refid is required"),
  confirm: z.literal(true, {
    errorMap: () => ({ message: "confirm must be true to proceed — this will restart the web GUI" }),
  }),
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
    name: "opnsense_sys_list_certs",
    description: "List all certificates in the OPNsense trust store with their refids, descriptions, and validity dates",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_sys_set_webgui_cert",
    description:
      "Assign an SSL certificate to the OPNsense web GUI. Downloads config, updates ssl-certref, restores config, and restarts the web GUI. Use opnsense_sys_list_certs to find available cert_refid values. Requires explicit confirmation as it restarts the web GUI (brief connectivity loss).",
    inputSchema: {
      type: "object" as const,
      properties: {
        cert_refid: {
          type: "string",
          description: "Certificate refid from opnsense_sys_list_certs (e.g. '69b4367c83731')",
        },
        confirm: {
          type: "boolean",
          description: "Must be true to confirm — this will restart the web GUI",
          enum: [true],
        },
      },
      required: ["cert_refid", "confirm"],
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

      case "opnsense_sys_list_certs": {
        const result = await client.get("/trust/cert/search");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_sys_set_webgui_cert": {
        const parsed = SetWebguiCertSchema.parse(args);

        // Step 1: Verify the certificate exists in the trust store
        const certs = await client.get<{ rows: Array<{ refid: string; descr: string }> }>("/trust/cert/search");
        const cert = certs.rows.find((c) => c.refid === parsed.cert_refid);
        if (!cert) {
          const available = certs.rows.map((c) => `${c.refid} (${c.descr})`).join(", ");
          return {
            content: [{
              type: "text",
              text: `Certificate with refid '${parsed.cert_refid}' not found. Available: ${available}`,
            }],
          };
        }

        // Step 2: Download current config backup
        const configXml = await client.getRaw("/core/backup/download/this");
        if (!configXml.includes("<opnsense>")) {
          return {
            content: [{ type: "text", text: "Failed to download configuration backup" }],
          };
        }

        // Step 3: Replace ssl-certref in the config
        const currentMatch = configXml.match(/<ssl-certref>(.*?)<\/ssl-certref>/);
        if (!currentMatch) {
          return {
            content: [{ type: "text", text: "Could not find ssl-certref in configuration" }],
          };
        }

        const currentRefid = currentMatch[1];
        if (currentRefid === parsed.cert_refid) {
          return {
            content: [{ type: "text", text: `Web GUI already uses certificate '${cert.descr}' (${parsed.cert_refid})` }],
          };
        }

        const modifiedXml = configXml.replace(
          `<ssl-certref>${currentRefid}</ssl-certref>`,
          `<ssl-certref>${parsed.cert_refid}</ssl-certref>`,
        );

        // Step 4: Restore the modified config
        const restoreResult = await client.post<{ status?: string }>("/core/backup/restore", {
          backupdata: modifiedXml,
        });

        // Step 5: Restart the web GUI service to apply
        await client.post("/core/service/restart/webgui");

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "ok",
              message: `Web GUI certificate changed from '${currentRefid}' to '${parsed.cert_refid}' (${cert.descr})`,
              previous_certref: currentRefid,
              new_certref: parsed.cert_refid,
              certificate_name: cert.descr,
              restore_status: restoreResult.status ?? "completed",
              note: "Web GUI is restarting — expect brief connectivity loss",
            }, null, 2),
          }],
        };
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
