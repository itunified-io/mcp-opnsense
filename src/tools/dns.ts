import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";
import { UuidSchema, HostnameSchema, DomainSchema } from "../utils/validation.js";

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

const AddOverrideSchema = z.object({
  hostname: HostnameSchema,
  domain: DomainSchema,
  server: z.string().ip({ message: "Invalid IP address" }),
  description: z.string().optional(),
  type: z.enum(["A", "AAAA", "CNAME"]).optional().default("A"),
});

const DeleteOverrideSchema = z.object({
  uuid: UuidSchema,
});

const AddForwardSchema = z.object({
  domain: DomainSchema,
  server: z.string().ip({ message: "Invalid server IP address" }),
  port: z.number().int().min(1).max(65535).optional().default(53),
});

const DeleteForwardSchema = z.object({
  uuid: UuidSchema,
});

const BlockDomainSchema = z.object({
  domain: DomainSchema,
  server: z.string().optional(),
  description: z.string().optional(),
});

const UnblockDomainSchema = z.object({
  uuid: UuidSchema,
});

const DnsLookupSchema = z.object({
  hostname: z.string().min(1, "Hostname is required"),
});

const DnsFlushZoneSchema = z.object({
  domain: DomainSchema,
});

const DnsCacheSearchSchema = z.object({
  domain: z.string().min(1, "Domain filter is required"),
});

// ---------------------------------------------------------------------------
// Tool definitions (for ListTools)
// ---------------------------------------------------------------------------

export const dnsToolDefinitions = [
  {
    name: "opnsense_dns_list_overrides",
    description: "List all DNS host overrides (A/AAAA/CNAME records) configured in Unbound",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_dns_add_override",
    description:
      "Add a DNS host override (A/AAAA/CNAME record) to Unbound. Run opnsense_dns_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        hostname: { type: "string", description: "Hostname (e.g. 'myserver')" },
        domain: { type: "string", description: "Domain (e.g. 'home.lab')" },
        server: { type: "string", description: "Target IP address" },
        description: { type: "string", description: "Optional description" },
        type: {
          type: "string",
          enum: ["A", "AAAA", "CNAME"],
          description: "Record type (default: A)",
        },
      },
      required: ["hostname", "domain", "server"],
    },
  },
  {
    name: "opnsense_dns_delete_override",
    description:
      "Delete a DNS host override by UUID. Run opnsense_dns_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the host override to delete" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_dns_list_forwards",
    description: "List all DNS-over-TLS forwarding servers configured in Unbound",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_dns_add_forward",
    description:
      "Add a DNS forwarding server (DNS-over-TLS). Run opnsense_dns_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        domain: { type: "string", description: "Domain to forward (e.g. 'example.com')" },
        server: { type: "string", description: "DNS server IP address" },
        port: {
          type: "number",
          description: "DNS server port (default: 53)",
        },
      },
      required: ["domain", "server"],
    },
  },
  {
    name: "opnsense_dns_delete_forward",
    description:
      "Delete a DNS forwarding entry by UUID. Run opnsense_dns_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the forwarding entry to delete" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_dns_list_blocklist",
    description: "List all domain overrides (used for domain blocking) in Unbound",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_dns_block_domain",
    description:
      "Block a domain by adding a domain override with an empty server. Run opnsense_dns_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        domain: { type: "string", description: "Domain to block (e.g. 'ads.example.com')" },
        server: {
          type: "string",
          description: "Server to redirect to (empty string = block, default: empty)",
        },
        description: { type: "string", description: "Optional description" },
      },
      required: ["domain"],
    },
  },
  {
    name: "opnsense_dns_unblock_domain",
    description:
      "Unblock a domain by deleting its domain override. Run opnsense_dns_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the domain override to delete" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_dns_flush_cache",
    description: "Flush the Unbound DNS resolver cache",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_dns_diagnostics",
    description: "Dump the current Unbound DNS cache for diagnostic purposes",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_dns_apply",
    description: "Apply pending DNS/Unbound configuration changes (reconfigure service)",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_dns_flush_zone",
    description:
      "Flush all cached DNS entries for a specific domain/zone. Use this to clear stale SERVFAIL or outdated records for a domain. Restarts Unbound to ensure complete cache clearing.",
    inputSchema: {
      type: "object" as const,
      properties: {
        domain: { type: "string", description: "Domain/zone to flush (e.g. 'example.com')" },
      },
      required: ["domain"],
    },
  },
  {
    name: "opnsense_dns_cache_search",
    description:
      "Search the Unbound DNS cache for entries matching a domain. Useful for diagnosing cached SERVFAIL, stale records, or verifying cache state.",
    inputSchema: {
      type: "object" as const,
      properties: {
        domain: { type: "string", description: "Domain to search for in cache (e.g. 'example.com')" },
      },
      required: ["domain"],
    },
  },
  {
    name: "opnsense_dns_stats",
    description:
      "Get Unbound DNS resolver statistics: query counts, cache hits/misses, uptime, and memory usage",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_dns_infra",
    description:
      "Dump the Unbound infrastructure cache showing upstream server RTT, EDNS support, and lame delegation status. Useful for diagnosing upstream DNS connectivity issues.",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function handleDnsTool(
  name: string,
  args: Record<string, unknown>,
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    switch (name) {
      case "opnsense_dns_list_overrides": {
        const result = await client.get("/unbound/settings/searchHostOverride");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dns_add_override": {
        const parsed = AddOverrideSchema.parse(args);
        const result = await client.post("/unbound/settings/addHostOverride", {
          host: {
            enabled: "1",
            hostname: parsed.hostname,
            domain: parsed.domain,
            rr: parsed.type,
            server: parsed.server,
            description: parsed.description ?? "",
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dns_delete_override": {
        const { uuid } = DeleteOverrideSchema.parse(args);
        const result = await client.post(`/unbound/settings/delHostOverride/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dns_list_forwards": {
        const result = await client.get("/unbound/settings/searchDot");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dns_add_forward": {
        const parsed = AddForwardSchema.parse(args);
        const result = await client.post("/unbound/settings/addDot", {
          dot: {
            enabled: "1",
            domain: parsed.domain,
            server: parsed.server,
            port: String(parsed.port),
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dns_delete_forward": {
        const { uuid } = DeleteForwardSchema.parse(args);
        const result = await client.post(`/unbound/settings/delDot/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dns_list_blocklist": {
        // OPNsense 24.7+: domain overrides merged into dots model
        const result = await client.get("/unbound/settings/searchDot");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dns_block_domain": {
        const parsed = BlockDomainSchema.parse(args);
        // OPNsense 24.7+: domain overrides merged into dots model (type: "forward")
        const result = await client.post("/unbound/settings/addDot", {
          dot: {
            enabled: "1",
            domain: parsed.domain,
            server: parsed.server || "127.0.0.1",
            port: "",
            verify: "",
            forward_tcp_upstream: "0",
            forward_first: "0",
            description: parsed.description ?? "",
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dns_unblock_domain": {
        const { uuid } = UnblockDomainSchema.parse(args);
        // OPNsense 24.7+: domain overrides merged into dots model
        const result = await client.post(`/unbound/settings/delDot/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dns_flush_cache": {
        const result = await client.post("/unbound/service/flushcache");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dns_diagnostics": {
        const result = await client.get("/unbound/diagnostics/dumpcache");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dns_apply": {
        const result = await client.post("/unbound/service/reconfigure");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dns_flush_zone": {
        const { domain } = DnsFlushZoneSchema.parse(args);
        // OPNsense doesn't expose per-zone flush via API.
        // Flush full cache then restart Unbound to clear infra cache too.
        await client.post("/unbound/service/flushcache");
        const result = await client.post("/unbound/service/reconfigure");
        return {
          content: [
            {
              type: "text",
              text: `Flushed DNS cache and restarted Unbound to clear all cached entries for ${domain}. Full cache and infrastructure cache cleared.`,
            },
          ],
        };
      }

      case "opnsense_dns_cache_search": {
        const { domain } = DnsCacheSearchSchema.parse(args);
        const cache = await client.get("/unbound/diagnostics/dumpcache");
        const cacheStr = typeof cache === "string" ? cache : JSON.stringify(cache);
        // Filter cache lines matching the domain
        const lines = cacheStr.split("\n").filter((line: string) =>
          line.toLowerCase().includes(domain.toLowerCase()),
        );
        if (lines.length === 0) {
          return {
            content: [{ type: "text", text: `No cache entries found matching '${domain}'` }],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Cache entries matching '${domain}' (${lines.length} found):\n${lines.join("\n")}`,
            },
          ],
        };
      }

      case "opnsense_dns_stats": {
        const result = await client.get("/unbound/diagnostics/stats");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_dns_infra": {
        const result = await client.get("/unbound/diagnostics/dumpinfra");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown DNS tool: ${name}` }],
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${message}` }],
    };
  }
}
