import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

const ArpFilterSchema = z.object({
  ip: z.string().optional(),
  mac: z.string().optional(),
  interface: z.string().optional(),
});

const PingSchema = z.object({
  address: z.string().min(1, "Address is required"),
  count: z.number().int().min(1).max(100).optional().default(3),
});

const TracerouteSchema = z.object({
  address: z.string().min(1, "Address is required"),
});

const DnsLookupSchema = z.object({
  hostname: z.string().min(1, "Hostname is required"),
});

const FwLogsSchema = z.object({
  limit: z.number().int().min(1).max(5000).optional().default(50),
});

// ---------------------------------------------------------------------------
// Tool definitions (for ListTools)
// ---------------------------------------------------------------------------

export const diagnosticsToolDefinitions = [
  {
    name: "opnsense_diag_arp_table",
    description:
      "Show the ARP table (IP-to-MAC mappings). Optionally filter by IP, MAC, or interface.",
    inputSchema: {
      type: "object" as const,
      properties: {
        ip: { type: "string", description: "Filter by IP address" },
        mac: { type: "string", description: "Filter by MAC address" },
        interface: { type: "string", description: "Filter by interface name" },
      },
    },
  },
  {
    name: "opnsense_diag_routes",
    description: "Show the routing table",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_diag_ping",
    description: "Ping a host from the OPNsense firewall",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: {
          type: "string",
          description: "IP address or hostname to ping",
        },
        count: {
          type: "number",
          description: "Number of ping packets (default: 3, max: 100)",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "opnsense_diag_traceroute",
    description: "Run a traceroute from the OPNsense firewall to a destination",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: {
          type: "string",
          description: "IP address or hostname to traceroute",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "opnsense_diag_dns_lookup",
    description: "Perform a DNS lookup from the OPNsense firewall",
    inputSchema: {
      type: "object" as const,
      properties: {
        hostname: {
          type: "string",
          description: "Hostname to look up",
        },
      },
      required: ["hostname"],
    },
  },
  {
    name: "opnsense_diag_fw_states",
    description: "List active firewall connection tracking states",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_diag_fw_logs",
    description: "Retrieve recent firewall log entries",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Number of log entries to retrieve (default: 50, max: 5000)",
        },
      },
    },
  },
  {
    name: "opnsense_diag_system_info",
    description: "Get system status information (CPU, memory, uptime, disk, versions)",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function handleDiagnosticsTool(
  name: string,
  args: Record<string, unknown>,
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    switch (name) {
      case "opnsense_diag_arp_table": {
        const filters = ArpFilterSchema.parse(args);
        const result = await client.get<unknown>("/diagnostics/interface/getArp");

        // Apply client-side filtering if any filter params provided
        if (filters.ip || filters.mac || filters.interface) {
          const entries = Array.isArray(result) ? result : [];
          const filtered = entries.filter((entry: Record<string, unknown>) => {
            if (filters.ip && !String(entry["ip"] ?? "").includes(filters.ip)) return false;
            if (filters.mac && !String(entry["mac"] ?? "").toLowerCase().includes(filters.mac.toLowerCase())) return false;
            if (filters.interface && String(entry["intf"] ?? "") !== filters.interface) return false;
            return true;
          });
          return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
        }

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_diag_routes": {
        const result = await client.get("/diagnostics/interface/getRoutes");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_diag_ping": {
        const parsed = PingSchema.parse(args);
        const result = await client.post("/diagnostics/interface/ping", {
          address: parsed.address,
          count: String(parsed.count),
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_diag_traceroute": {
        const parsed = TracerouteSchema.parse(args);
        const result = await client.post("/diagnostics/interface/traceroute", {
          address: parsed.address,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_diag_dns_lookup": {
        const parsed = DnsLookupSchema.parse(args);
        const result = await client.post("/diagnostics/dns/lookup", {
          hostname: parsed.hostname,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_diag_fw_states": {
        const result = await client.get("/diagnostics/firewall/listStates");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_diag_fw_logs": {
        const parsed = FwLogsSchema.parse(args);
        const result = await client.get(
          `/diagnostics/firewall/log?limit=${parsed.limit}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_diag_system_info": {
        const result = await client.get("/core/system/status");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown diagnostics tool: ${name}` }],
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${message}` }],
    };
  }
}
