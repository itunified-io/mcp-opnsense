import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";
import { UuidSchema, MacAddressSchema } from "../utils/validation.js";

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

const FindLeaseSchema = z.object({
  query: z.string().min(1, "Search query is required (IP, MAC, or hostname)"),
});

const AddStaticMapSchema = z.object({
  mac: MacAddressSchema,
  ipaddr: z.string().ip({ message: "Invalid IP address" }),
  hostname: z.string().optional(),
  description: z.string().optional(),
});

const DeleteStaticMapSchema = z.object({
  uuid: UuidSchema,
});

// ---------------------------------------------------------------------------
// Tool definitions (for ListTools)
// ---------------------------------------------------------------------------

export const dhcpToolDefinitions = [
  {
    name: "opnsense_dhcp_list_leases",
    description: "List all current DHCPv4 leases",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_dhcp_find_lease",
    description: "Search DHCPv4 leases by IP address, MAC address, or hostname",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search term — IP address, MAC address, or hostname",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "opnsense_dhcp_list_static",
    description: "List all static DHCP mappings (MAC-to-IP reservations)",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_dhcp_add_static",
    description:
      "Add a static DHCP mapping (MAC-to-IP reservation). Requires DHCP service restart to take effect.",
    inputSchema: {
      type: "object" as const,
      properties: {
        mac: {
          type: "string",
          description: "MAC address (format: AA:BB:CC:DD:EE:FF)",
        },
        ipaddr: {
          type: "string",
          description: "IP address to assign",
        },
        hostname: {
          type: "string",
          description: "Optional hostname for the mapping",
        },
        description: {
          type: "string",
          description: "Optional description",
        },
      },
      required: ["mac", "ipaddr"],
    },
  },
  {
    name: "opnsense_dhcp_delete_static",
    description: "Delete a static DHCP mapping by UUID",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the static mapping to delete" },
      },
      required: ["uuid"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function handleDhcpTool(
  name: string,
  args: Record<string, unknown>,
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    switch (name) {
      case "opnsense_dhcp_list_leases": {
        const result = await client.get("/dhcpv4/leases/searchLease");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dhcp_find_lease": {
        const parsed = FindLeaseSchema.parse(args);
        const result = await client.get(
          `/dhcpv4/leases/searchLease?searchPhrase=${encodeURIComponent(parsed.query)}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dhcp_list_static": {
        const result = await client.get("/dhcpv4/leases/searchStaticMap");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dhcp_add_static": {
        const parsed = AddStaticMapSchema.parse(args);
        const result = await client.post("/dhcpv4/leases/addStaticMap", {
          staticmap: {
            mac: parsed.mac,
            ipaddr: parsed.ipaddr,
            hostname: parsed.hostname ?? "",
            description: parsed.description ?? "",
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dhcp_delete_static": {
        const { uuid } = DeleteStaticMapSchema.parse(args);
        const result = await client.post(`/dhcpv4/leases/delStaticMap/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown DHCP tool: ${name}` }],
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${message}` }],
    };
  }
}
