import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";
import { UuidSchema } from "../utils/validation.js";
import { extractSelected } from "./firewall.js";

// MCP transports may serialize booleans as strings — coerce "true"/"false"
// before the literal check (see #120).
const ConfirmTrue = (msg: string) =>
  z.preprocess(
    (v) => (v === "true" ? true : v === "false" ? false : v),
    z.literal(true, { errorMap: () => ({ message: msg }) }),
  );

// Coerce booleans that may arrive as MCP-string from clients.
const CoerceBoolean = z.preprocess((v) => {
  if (v === "true" || v === "1" || v === 1) return true;
  if (v === "false" || v === "0" || v === 0) return false;
  return v;
}, z.boolean());

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

const NetworkSchema = z
  .string()
  .regex(
    /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\/(?:3[0-2]|[12]?\d)$/,
    "Invalid network CIDR (e.g., 100.64.0.0/10 or 10.0.0.0/8)",
  );

const AddRouteSchema = z.object({
  network: NetworkSchema,
  gateway: z.string().min(1, "Gateway name or UUID is required"),
  disabled: z.boolean().optional().default(false),
  description: z.string().optional(),
});

const UpdateRouteSchema = z.object({
  uuid: UuidSchema,
  network: NetworkSchema.optional(),
  gateway: z.string().min(1).optional(),
  disabled: z.boolean().optional(),
  description: z.string().optional(),
});

const DeleteRouteSchema = z.object({
  uuid: UuidSchema,
});

const GatewayUpdateSchema = z.object({
  uuid: UuidSchema,
  monitor_disable: CoerceBoolean.optional(),
  monitor: z.string().optional(),
  disabled: CoerceBoolean.optional(),
  defaultgw: CoerceBoolean.optional(),
  description: z.string().optional(),
  weight: z.coerce.number().int().min(1).max(30).optional(),
  priority: z.coerce.number().int().min(1).max(255).optional(),
  confirm: ConfirmTrue("confirm must be true to proceed with the gateway update"),
});

const GatewayApplySchema = z.object({
  confirm: ConfirmTrue("confirm must be true to apply gateway configuration"),
});

// Convert a JS boolean (true/false) or pass-through string ("0"/"1") to OPNsense's
// expected "0" / "1" string representation.
function boolToFlag(v: boolean | undefined): string | undefined {
  if (v === undefined) return undefined;
  return v ? "1" : "0";
}

// ---------------------------------------------------------------------------
// Tool definitions (for ListTools)
// ---------------------------------------------------------------------------

export const routingToolDefinitions = [
  {
    name: "opnsense_route_list",
    description: "List all configured static routes",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_route_add",
    description:
      "Add a static route. The gateway parameter must be a gateway name from opnsense_route_gateway_list. Run opnsense_route_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        network: {
          type: "string",
          description: "Destination network in CIDR notation (e.g., 100.64.0.0/10)",
        },
        gateway: {
          type: "string",
          description:
            "Gateway name or UUID (use opnsense_route_gateway_list to find available gateways)",
        },
        disabled: {
          type: "boolean",
          description: "Whether the route is disabled (default: false)",
        },
        description: { type: "string", description: "Optional description" },
      },
      required: ["network", "gateway"],
    },
  },
  {
    name: "opnsense_route_update",
    description:
      "Update an existing static route. Run opnsense_route_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the route to update" },
        network: { type: "string", description: "Destination network in CIDR notation" },
        gateway: { type: "string", description: "Gateway name or UUID" },
        disabled: { type: "boolean", description: "Whether the route is disabled" },
        description: { type: "string", description: "Optional description" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_route_delete",
    description:
      "Delete a static route. Run opnsense_route_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the route to delete" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_route_apply",
    description: "Apply static route configuration changes (reconfigure routing)",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_route_gateway_list",
    description: "List all available gateways (used as targets for static routes)",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_route_gateway_status",
    description: "Get live gateway monitor status: per-gateway online/offline state, RTT (delay), packet loss, stddev, monitor IP, and monitor_disable flag. Read-only — complements opnsense_route_gateway_list (which only returns config).",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_route_gateway_update",
    description: "Update an existing gateway's settings (toggle monitoring, set monitor IP, change weight/priority, enable/disable). Round-trips current config and only overrides explicitly provided fields. After updating, call opnsense_route_gateway_apply to activate the change. DESTRUCTIVE: requires explicit confirmation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "Gateway UUID (from opnsense_route_gateway_list)" },
        monitor_disable: { type: "boolean", description: "Disable gateway monitoring (true = no health probe)" },
        monitor: { type: "string", description: "Monitor IP address (used when monitor_disable=false). Empty string clears it." },
        disabled: { type: "boolean", description: "Disable the gateway entirely" },
        defaultgw: { type: "boolean", description: "Mark as default gateway" },
        description: { type: "string", description: "Human-readable description" },
        weight: { type: "number", description: "Load-balancing weight (1-30)" },
        priority: { type: "number", description: "Failover priority (1-255, lower = higher priority)" },
        confirm: { type: "boolean", description: "Must be true to confirm the update", enum: [true] },
      },
      required: ["uuid", "confirm"],
    },
  },
  {
    name: "opnsense_route_gateway_apply",
    description: "Apply pending gateway configuration changes (calls /api/routing/settings/reconfigure). Required after opnsense_route_gateway_update for changes to take effect. May briefly affect WAN connectivity. DESTRUCTIVE: requires explicit confirmation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        confirm: { type: "boolean", description: "Must be true to confirm the apply", enum: [true] },
      },
      required: ["confirm"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function handleRoutingTool(
  name: string,
  args: Record<string, unknown>,
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    switch (name) {
      case "opnsense_route_list": {
        const result = await client.get("/routes/routes/searchroute");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_route_add": {
        const parsed = AddRouteSchema.parse(args);
        const result = await client.post("/routes/routes/addroute", {
          route: {
            network: parsed.network,
            gateway: parsed.gateway,
            disabled: parsed.disabled ? "1" : "0",
            description: parsed.description ?? "",
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_route_update": {
        const parsed = UpdateRouteSchema.parse(args);
        const existing = await client.get<{ route: Record<string, unknown> }>(
          `/routes/routes/getroute/${parsed.uuid}`,
        );
        const route = existing.route;
        const result = await client.post(`/routes/routes/setroute/${parsed.uuid}`, {
          route: {
            network: parsed.network ?? route["network"],
            gateway: parsed.gateway ?? route["gateway"],
            disabled:
              parsed.disabled !== undefined
                ? parsed.disabled
                  ? "1"
                  : "0"
                : route["disabled"],
            description: parsed.description ?? route["description"],
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_route_delete": {
        const { uuid } = DeleteRouteSchema.parse(args);
        const result = await client.post(`/routes/routes/delroute/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_route_apply": {
        const result = await client.post("/routes/routes/reconfigure");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_route_gateway_list": {
        const result = await client.get("/routing/settings/searchGateway");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_route_gateway_status": {
        const result = await client.get("/routes/gateway/status");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_route_gateway_update": {
        const parsed = GatewayUpdateSchema.parse(args);

        // Round-trip: get current state, flatten multi-selects, override only provided fields
        const current = (await client.get<{ gateway_item?: Record<string, unknown> }>(
          `/routing/settings/getGateway/${encodeURIComponent(parsed.uuid)}`,
        ))?.gateway_item ?? {};

        const flat: Record<string, unknown> = {
          name: extractSelected(current["name"]) ?? current["name"],
          descr: parsed.description ?? (extractSelected(current["descr"]) ?? current["descr"] ?? ""),
          interface: extractSelected(current["interface"]) ?? "",
          ipprotocol: extractSelected(current["ipprotocol"]) ?? "inet",
          gateway: extractSelected(current["gateway"]) ?? current["gateway"] ?? "",
          defaultgw:
            boolToFlag(parsed.defaultgw) ??
            (extractSelected(current["defaultgw"]) ?? current["defaultgw"] ?? "0"),
          fargw: extractSelected(current["fargw"]) ?? current["fargw"] ?? "",
          monitor_disable:
            boolToFlag(parsed.monitor_disable) ??
            (extractSelected(current["monitor_disable"]) ?? current["monitor_disable"] ?? "0"),
          monitor_noroute:
            extractSelected(current["monitor_noroute"]) ?? current["monitor_noroute"] ?? "",
          monitor:
            parsed.monitor !== undefined
              ? parsed.monitor
              : (extractSelected(current["monitor"]) ?? current["monitor"] ?? ""),
          force_down: extractSelected(current["force_down"]) ?? current["force_down"] ?? "",
          priority:
            parsed.priority !== undefined
              ? String(parsed.priority)
              : (extractSelected(current["priority"]) ?? current["priority"] ?? "255"),
          weight:
            parsed.weight !== undefined
              ? String(parsed.weight)
              : (extractSelected(current["weight"]) ?? current["weight"] ?? "1"),
          latencylow: extractSelected(current["latencylow"]) ?? current["latencylow"] ?? "",
          latencyhigh: extractSelected(current["latencyhigh"]) ?? current["latencyhigh"] ?? "",
          losslow: extractSelected(current["losslow"]) ?? current["losslow"] ?? "",
          losshigh: extractSelected(current["losshigh"]) ?? current["losshigh"] ?? "",
          interval: extractSelected(current["interval"]) ?? current["interval"] ?? "",
          time_period: extractSelected(current["time_period"]) ?? current["time_period"] ?? "",
          loss_interval: extractSelected(current["loss_interval"]) ?? current["loss_interval"] ?? "",
          data_length: extractSelected(current["data_length"]) ?? current["data_length"] ?? "",
          disabled:
            boolToFlag(parsed.disabled) ??
            (extractSelected(current["disabled"]) ?? current["disabled"] ?? "0"),
        };

        const result = await client.post(
          `/routing/settings/setGateway/${encodeURIComponent(parsed.uuid)}`,
          { gateway_item: flat },
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_route_gateway_apply": {
        GatewayApplySchema.parse(args);
        const result = await client.post("/routing/settings/reconfigure", {});
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown routing tool: ${name}` }] };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { content: [{ type: "text", text: `Error executing ${name}: ${message}` }] };
  }
}
