import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

const TailscaleSettingsSetSchema = z.object({
  enabled: z.preprocess(
    (v) => (v === "true" || v === true || v === "1" ? "1" : v === "false" || v === false || v === "0" ? "0" : v),
    z.enum(["0", "1"]).optional(),
  ),
  port: z.string().regex(/^\d+$/, "Port must be a numeric string").optional(),
  auth_key: z.string().optional().describe("Tailscale auth key for automatic enrollment"),
  advertise_routes: z.string().optional().describe("Comma-separated CIDR list to advertise (e.g. '10.10.0.0/24,10.10.20.0/24')"),
  advertise_exit_node: z.preprocess(
    (v) => (v === "true" || v === true || v === "1" ? "1" : v === "false" || v === false || v === "0" ? "0" : v),
    z.enum(["0", "1"]).optional(),
  ),
  accept_routes: z.preprocess(
    (v) => (v === "true" || v === true || v === "1" ? "1" : v === "false" || v === false || v === "0" ? "0" : v),
    z.enum(["0", "1"]).optional(),
  ),
  accept_dns: z.preprocess(
    (v) => (v === "true" || v === true || v === "1" ? "1" : v === "false" || v === false || v === "0" ? "0" : v),
    z.enum(["0", "1"]).optional(),
  ),
});

const TailscaleServiceActionSchema = z.object({
  action: z.enum(["start", "stop", "restart", "reconfigure"], {
    errorMap: () => ({ message: "action must be one of: start, stop, restart, reconfigure" }),
  }),
});

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const tailscaleToolDefinitions = [
  {
    name: "opnsense_tailscale_settings_get",
    description: "Get current Tailscale plugin settings (enabled, port, auth-key, advertise-routes, accept-routes, accept-dns, exit-node).",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "opnsense_tailscale_settings_set",
    description:
      "Update Tailscale plugin settings. Only provided fields are changed. Run opnsense_tailscale_service_control with action 'reconfigure' afterwards to apply.",
    inputSchema: {
      type: "object" as const,
      properties: {
        enabled: {
          type: "string",
          enum: ["0", "1"],
          description: "Enable (1) or disable (0) the Tailscale service",
        },
        port: {
          type: "string",
          description: "UDP port for Tailscale (default: 41641)",
        },
        auth_key: {
          type: "string",
          description: "Tailscale auth key for automatic enrollment",
        },
        advertise_routes: {
          type: "string",
          description: "Comma-separated CIDR list to advertise as subnet routes (e.g. '10.10.0.0/24')",
        },
        advertise_exit_node: {
          type: "string",
          enum: ["0", "1"],
          description: "Advertise as exit node (1) or not (0)",
        },
        accept_routes: {
          type: "string",
          enum: ["0", "1"],
          description: "Accept routes from other nodes (1) or not (0)",
        },
        accept_dns: {
          type: "string",
          enum: ["0", "1"],
          description: "Accept DNS configuration from tailnet (1) or not (0)",
        },
      },
    },
  },
  {
    name: "opnsense_tailscale_service_control",
    description:
      "Control the Tailscale service: start, stop, restart, or reconfigure (apply settings changes).",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["start", "stop", "restart", "reconfigure"],
          description: "Service action to perform",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "opnsense_tailscale_service_status",
    description: "Check if the Tailscale service (tailscaled) is running.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleTailscaleTool(
  name: string,
  args: Record<string, unknown>,
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    switch (name) {
      case "opnsense_tailscale_settings_get": {
        const result = await client.get("/tailscale/settings/get");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_tailscale_settings_set": {
        const parsed = TailscaleSettingsSetSchema.parse(args);
        const settings: Record<string, string> = {};
        if (parsed.enabled !== undefined) settings.enabled = parsed.enabled;
        if (parsed.port !== undefined) settings.port = parsed.port;
        if (parsed.auth_key !== undefined) settings.auth_key = parsed.auth_key;
        if (parsed.advertise_routes !== undefined) settings.advertise_routes = parsed.advertise_routes;
        if (parsed.advertise_exit_node !== undefined) settings.advertise_exit_node = parsed.advertise_exit_node;
        if (parsed.accept_routes !== undefined) settings.accept_routes = parsed.accept_routes;
        if (parsed.accept_dns !== undefined) settings.accept_dns = parsed.accept_dns;

        const result = await client.post("/tailscale/settings/set", { settings });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_tailscale_service_control": {
        const parsed = TailscaleServiceActionSchema.parse(args);
        const result = await client.post(`/tailscale/service/${parsed.action}`, {});
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_tailscale_service_status": {
        const result = await client.get("/tailscale/service/status");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tailscale tool: ${name}` }],
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `Error: ${message}` }] };
  }
}
