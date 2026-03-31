import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";
import { UuidSchema } from "../utils/validation.js";

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

      default:
        return { content: [{ type: "text", text: `Unknown routing tool: ${name}` }] };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { content: [{ type: "text", text: `Error executing ${name}: ${message}` }] };
  }
}
