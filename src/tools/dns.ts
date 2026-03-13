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
    description: "Flush the Unbound DNS cache and DNSBL data",
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
        const result = await client.post("/unbound/service/dnsbl");
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
