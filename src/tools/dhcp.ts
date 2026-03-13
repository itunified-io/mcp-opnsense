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
    description: "List all static DHCP mappings (MAC-to-IP reservations). Uses Kea DHCP on OPNsense 24.7+.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_dhcp_add_static",
    description:
      "Add a static DHCP mapping (MAC-to-IP reservation). Uses Kea DHCP on OPNsense 24.7+. Requires DHCP service restart to take effect.",
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
        // OPNsense 24.7+: ISC DHCP static maps removed, use Kea reservations
        const result = await client.get("/kea/dhcpv4/search_reservation");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dhcp_add_static": {
        const parsed = AddStaticMapSchema.parse(args);

        // OPNsense 24.7+: Kea requires a subnet UUID for reservations
        // Auto-discover the matching subnet for the given IP
        const subnets = await client.get<{
          rows?: Array<{ uuid: string; subnet: string }>;
        }>("/kea/dhcpv4/search_subnet");

        let subnetUuid = "";
        for (const s of subnets.rows ?? []) {
          // subnet format: "10.10.0.0/24" — check if IP falls within
          const [network, bits] = s.subnet.split("/");
          if (network && bits) {
            const netParts = network.split(".").map(Number);
            const ipParts = parsed.ipaddr.split(".").map(Number);
            const mask = ~((1 << (32 - Number(bits))) - 1) >>> 0;
            const netNum = ((netParts[0] << 24) | (netParts[1] << 16) | (netParts[2] << 8) | netParts[3]) >>> 0;
            const ipNum = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
            if ((ipNum & mask) === (netNum & mask)) {
              subnetUuid = s.uuid;
              break;
            }
          }
        }

        if (!subnetUuid) {
          const available = (subnets.rows ?? []).map((s) => s.subnet).join(", ");
          return {
            content: [{
              type: "text",
              text: `No Kea DHCP subnet found for IP ${parsed.ipaddr}. Available subnets: ${available || "none"}`,
            }],
          };
        }

        const result = await client.post("/kea/dhcpv4/add_reservation", {
          reservation: {
            subnet: subnetUuid,
            hw_address: parsed.mac,
            ip_address: parsed.ipaddr,
            hostname: parsed.hostname ?? "",
            description: parsed.description ?? "",
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dhcp_delete_static": {
        const { uuid } = DeleteStaticMapSchema.parse(args);
        // OPNsense 24.7+: use Kea DHCP reservation API
        const result = await client.post(`/kea/dhcpv4/del_reservation/${uuid}`);
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
