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
  hostname: z.string().min(1, "Hostname or IP address is required"),
});

// Use z.coerce.number() because MCP transports serialize numeric tool params as
// strings — see #116 (mirror of mcp-cloudflare proxied boolean bug).
const FwLogsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).optional().default(50),
});

const LogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).optional().default(500),
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
    name: "opnsense_diag_reverse_dns",
    description:
      "Perform a reverse DNS lookup (IP to hostname) from the OPNsense firewall",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: {
          type: "string",
          description: "IP address to reverse-lookup",
        },
      },
      required: ["address"],
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
  {
    name: "opnsense_diag_log_system",
    description: "Retrieve recent OPNsense system log entries (kernel, generic system events).",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of log entries (1-5000, default 500)" },
      },
    },
  },
  {
    name: "opnsense_diag_log_gateways",
    description: "Retrieve recent OPNsense gateway monitoring (dpinger) log entries — useful for WAN/gateway health debugging.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of log entries (1-5000, default 500)" },
      },
    },
  },
  {
    name: "opnsense_diag_log_routing",
    description: "Retrieve recent OPNsense routing daemon log entries.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of log entries (1-5000, default 500)" },
      },
    },
  },
  {
    name: "opnsense_diag_log_resolver",
    description: "Retrieve recent Unbound DNS resolver log entries.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of log entries (1-5000, default 500)" },
      },
    },
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

        // OPNsense 24.7+: job-based ping API (set → start → poll → remove)
        const setResult = await client.post<{ uuid?: string; result?: string }>(
          "/diagnostics/ping/set",
          { ping: { settings: { hostname: parsed.address, count: String(parsed.count) } } },
        );

        const jobId = setResult.uuid;
        if (!jobId) {
          return { content: [{ type: "text", text: JSON.stringify(setResult, null, 2) }] };
        }

        await client.post(`/diagnostics/ping/start/${jobId}`);

        // Poll until send count reaches requested count (status stays "running" throughout)
        const maxWait = Math.max(parsed.count * 2000, 10000);
        const start = Date.now();
        let result: Record<string, unknown> | undefined;
        while (Date.now() - start < maxWait) {
          await new Promise((r) => setTimeout(r, 1500));
          const jobs = await client.get<{
            rows?: Array<Record<string, unknown>>;
          }>("/diagnostics/ping/search_jobs");
          const job = (jobs.rows ?? []).find(
            (j) => j.id === jobId || j.uuid === jobId,
          );
          if (job && Number(job.send ?? 0) >= parsed.count) {
            result = job;
            break;
          }
        }

        // Cleanup
        try {
          await client.post(`/diagnostics/ping/remove/${jobId}`);
        } catch {
          // Best-effort cleanup
        }

        if (!result) {
          return { content: [{ type: "text", text: "Ping timed out waiting for results" }] };
        }

        // Format clean output
        const output = {
          host: result.hostname,
          packets_sent: result.send,
          packets_received: result.received,
          packet_loss: result.loss,
          rtt_min_ms: result.min,
          rtt_avg_ms: result.avg,
          rtt_max_ms: result.max,
          rtt_stddev_ms: result["std-dev"],
        };
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
      }

      case "opnsense_diag_traceroute": {
        const parsed = TracerouteSchema.parse(args);

        // OPNsense 24.7+: set is synchronous — executes traceroute and returns results
        const result = await client.post("/diagnostics/traceroute/set", {
          traceroute: {
            settings: {
              hostname: parsed.address,
            },
          },
        });

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_diag_dns_lookup": {
        const parsed = DnsLookupSchema.parse(args);

        // OPNsense 24.7+: use reverse_lookup for IP→hostname resolution
        // Forward lookup (hostname→IP) is not available via API in 24.7
        const result = await client.get(
          `/diagnostics/dns/reverse_lookup?address=${encodeURIComponent(parsed.hostname)}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_diag_reverse_dns": {
        const parsed = z.object({ address: z.string().min(1) }).parse(args);
        const result = await client.get(
          `/diagnostics/dns/reverse_lookup?address=${encodeURIComponent(parsed.address)}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_diag_fw_states": {
        const result = await client.post("/diagnostics/firewall/query_states");
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

      case "opnsense_diag_log_system": {
        const parsed = LogQuerySchema.parse(args);
        const result = await client.get(`/diagnostics/log/core/system?limit=${parsed.limit}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_diag_log_gateways": {
        const parsed = LogQuerySchema.parse(args);
        const result = await client.get(`/diagnostics/log/core/gateways?limit=${parsed.limit}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_diag_log_routing": {
        const parsed = LogQuerySchema.parse(args);
        const result = await client.get(`/diagnostics/log/core/routing?limit=${parsed.limit}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_diag_log_resolver": {
        const parsed = LogQuerySchema.parse(args);
        const result = await client.get(`/diagnostics/log/core/resolver?limit=${parsed.limit}`);
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
