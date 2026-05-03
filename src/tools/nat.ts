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

const CoerceBoolean = z.preprocess((v) => {
  if (v === "true" || v === "1" || v === 1) return true;
  if (v === "false" || v === "0" || v === 0) return false;
  return v;
}, z.boolean());

// ---------------------------------------------------------------------------
// Source NAT (outbound) — wraps /api/firewall/source_nat/* endpoints
// introduced/finalized in OPNsense 26.1 "Witty Woodpecker".
//
// Note: Destination NAT (port forwarding) does NOT yet have a dedicated
// modern API endpoint in OPNsense 26.1.7 (all probed paths return 404).
// DNAT support will follow in a separate change once OPNsense exposes it.
// ---------------------------------------------------------------------------

const SourceNatAddSchema = z.object({
  enabled: CoerceBoolean.optional().default(true),
  interface: z.string().min(1, "interface is required (e.g. 'wan')"),
  ipprotocol: z.enum(["inet", "inet6"]).optional().default("inet"),
  protocol: z.string().optional(), // any | TCP | UDP | TCP/UDP | ...
  source_net: z.string().optional().default("any"),
  source_not: CoerceBoolean.optional().default(false),
  source_port: z.string().optional(),
  destination_net: z.string().optional().default("any"),
  destination_not: CoerceBoolean.optional().default(false),
  destination_port: z.string().optional(),
  target: z.string().optional().default("wanip"), // wanip | <ip> | host alias
  target_port: z.string().optional(),
  staticnatport: CoerceBoolean.optional().default(false),
  nonat: CoerceBoolean.optional().default(false),
  log: CoerceBoolean.optional().default(false),
  sequence: z.coerce.number().int().min(1).max(99999).optional().default(100),
  tagged: z.string().optional(),
  description: z.string().optional(),
  confirm: ConfirmTrue("confirm must be true to add a source NAT rule"),
});

const SourceNatUpdateSchema = z.object({
  uuid: UuidSchema,
  enabled: CoerceBoolean.optional(),
  interface: z.string().optional(),
  ipprotocol: z.enum(["inet", "inet6"]).optional(),
  protocol: z.string().optional(),
  source_net: z.string().optional(),
  source_not: CoerceBoolean.optional(),
  source_port: z.string().optional(),
  destination_net: z.string().optional(),
  destination_not: CoerceBoolean.optional(),
  destination_port: z.string().optional(),
  target: z.string().optional(),
  target_port: z.string().optional(),
  staticnatport: CoerceBoolean.optional(),
  nonat: CoerceBoolean.optional(),
  log: CoerceBoolean.optional(),
  sequence: z.coerce.number().int().min(1).max(99999).optional(),
  tagged: z.string().optional(),
  description: z.string().optional(),
  confirm: ConfirmTrue("confirm must be true to update a source NAT rule"),
});

const SourceNatUuidConfirmSchema = z.object({
  uuid: UuidSchema,
  confirm: ConfirmTrue("confirm must be true to proceed"),
});

const ApplySchema = z.object({
  confirm: ConfirmTrue("confirm must be true to apply NAT configuration"),
});

function flag(b: boolean | undefined): string | undefined {
  if (b === undefined) return undefined;
  return b ? "1" : "0";
}

// ---------------------------------------------------------------------------

export const natToolDefinitions = [
  {
    name: "opnsense_nat_source_list",
    description:
      "List all Source NAT (outbound) rules. Read-only. Returns rule UUID, sequence, interface, source/destination, target, enabled state.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_nat_source_get",
    description: "Get a single Source NAT rule by UUID with full configuration. Read-only.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "Source NAT rule UUID" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_nat_source_add",
    description:
      "Add a new Source NAT (outbound) rule. After adding, call opnsense_nat_apply to activate. DESTRUCTIVE: requires explicit confirmation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        enabled: { type: "boolean", description: "Rule enabled (default: true)" },
        interface: { type: "string", description: "Interface name (e.g. 'wan', 'lan', 'opt1')" },
        ipprotocol: { type: "string", enum: ["inet", "inet6"], description: "IP version" },
        protocol: { type: "string", description: "Protocol: any/TCP/UDP/TCP/UDP/ICMP/..." },
        source_net: { type: "string", description: "Source network (any/CIDR/alias). Default: any" },
        source_not: { type: "boolean", description: "Invert source match" },
        source_port: { type: "string", description: "Source port/range" },
        destination_net: { type: "string", description: "Destination network. Default: any" },
        destination_not: { type: "boolean", description: "Invert destination match" },
        destination_port: { type: "string", description: "Destination port/range" },
        target: { type: "string", description: "Translation target: 'wanip' (default), specific IP, or alias" },
        target_port: { type: "string", description: "Translation target port" },
        staticnatport: { type: "boolean", description: "Use static source port" },
        nonat: { type: "boolean", description: "If true, exclude this traffic from NAT (no-NAT rule)" },
        log: { type: "boolean", description: "Log packets matching this rule" },
        sequence: { type: "number", description: "Rule order (default: 100)" },
        tagged: { type: "string", description: "Match a packet tag set by another rule" },
        description: { type: "string", description: "Human-readable description" },
        confirm: { type: "boolean", description: "Must be true to confirm", enum: [true] },
      },
      required: ["interface", "confirm"],
    },
  },
  {
    name: "opnsense_nat_source_update",
    description:
      "Update an existing Source NAT rule. Round-trips current config and only overrides explicitly provided fields. DESTRUCTIVE.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "Rule UUID" },
        enabled: { type: "boolean" },
        interface: { type: "string" },
        ipprotocol: { type: "string", enum: ["inet", "inet6"] },
        protocol: { type: "string" },
        source_net: { type: "string" },
        source_not: { type: "boolean" },
        source_port: { type: "string" },
        destination_net: { type: "string" },
        destination_not: { type: "boolean" },
        destination_port: { type: "string" },
        target: { type: "string" },
        target_port: { type: "string" },
        staticnatport: { type: "boolean" },
        nonat: { type: "boolean" },
        log: { type: "boolean" },
        sequence: { type: "number" },
        tagged: { type: "string" },
        description: { type: "string" },
        confirm: { type: "boolean", enum: [true] },
      },
      required: ["uuid", "confirm"],
    },
  },
  {
    name: "opnsense_nat_source_delete",
    description: "Delete a Source NAT rule. DESTRUCTIVE: requires explicit confirmation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "Rule UUID" },
        confirm: { type: "boolean", enum: [true] },
      },
      required: ["uuid", "confirm"],
    },
  },
  {
    name: "opnsense_nat_source_toggle",
    description: "Toggle a Source NAT rule's enabled state. DESTRUCTIVE: requires explicit confirmation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string" },
        confirm: { type: "boolean", enum: [true] },
      },
      required: ["uuid", "confirm"],
    },
  },
  {
    name: "opnsense_nat_apply",
    description:
      "Apply pending NAT configuration changes. Required after add/update/delete/toggle for changes to take effect. DESTRUCTIVE.",
    inputSchema: {
      type: "object" as const,
      properties: {
        confirm: { type: "boolean", enum: [true] },
      },
      required: ["confirm"],
    },
  },
];

// ---------------------------------------------------------------------------

export async function handleNatTool(
  name: string,
  args: Record<string, unknown>,
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    switch (name) {
      case "opnsense_nat_source_list": {
        const result = await client.get("/firewall/source_nat/search_rule");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_nat_source_get": {
        const uuid = z.object({ uuid: UuidSchema }).parse(args).uuid;
        const result = await client.get(
          `/firewall/source_nat/get_rule/${encodeURIComponent(uuid)}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_nat_source_add": {
        const p = SourceNatAddSchema.parse(args);
        const rule: Record<string, unknown> = {
          enabled: flag(p.enabled),
          interface: p.interface,
          ipprotocol: p.ipprotocol,
          protocol: p.protocol ?? "",
          source_net: p.source_net,
          source_not: flag(p.source_not),
          source_port: p.source_port ?? "",
          destination_net: p.destination_net,
          destination_not: flag(p.destination_not),
          destination_port: p.destination_port ?? "",
          target: p.target ?? "",
          target_port: p.target_port ?? "",
          staticnatport: flag(p.staticnatport),
          nonat: flag(p.nonat),
          log: flag(p.log),
          sequence: String(p.sequence),
          tagged: p.tagged ?? "",
          description: p.description ?? "",
        };
        const result = await client.post("/firewall/source_nat/add_rule", { rule });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_nat_source_update": {
        const p = SourceNatUpdateSchema.parse(args);
        const current = (await client.get<{ rule?: Record<string, unknown> }>(
          `/firewall/source_nat/get_rule/${encodeURIComponent(p.uuid)}`,
        ))?.rule ?? {};

        const merged: Record<string, unknown> = {
          enabled:
            flag(p.enabled) ??
            (extractSelected(current["enabled"]) ?? current["enabled"] ?? "1"),
          interface:
            p.interface ?? extractSelected(current["interface"]) ?? "",
          ipprotocol:
            p.ipprotocol ?? extractSelected(current["ipprotocol"]) ?? "inet",
          protocol:
            p.protocol ?? extractSelected(current["protocol"]) ?? "",
          source_net:
            p.source_net ?? (extractSelected(current["source_net"]) ?? current["source_net"] ?? "any"),
          source_not:
            flag(p.source_not) ??
            (extractSelected(current["source_not"]) ?? current["source_not"] ?? "0"),
          source_port:
            p.source_port ?? (extractSelected(current["source_port"]) ?? current["source_port"] ?? ""),
          destination_net:
            p.destination_net ?? (extractSelected(current["destination_net"]) ?? current["destination_net"] ?? "any"),
          destination_not:
            flag(p.destination_not) ??
            (extractSelected(current["destination_not"]) ?? current["destination_not"] ?? "0"),
          destination_port:
            p.destination_port ?? (extractSelected(current["destination_port"]) ?? current["destination_port"] ?? ""),
          target:
            p.target ?? (extractSelected(current["target"]) ?? current["target"] ?? ""),
          target_port:
            p.target_port ?? (extractSelected(current["target_port"]) ?? current["target_port"] ?? ""),
          staticnatport:
            flag(p.staticnatport) ??
            (extractSelected(current["staticnatport"]) ?? current["staticnatport"] ?? "0"),
          nonat:
            flag(p.nonat) ??
            (extractSelected(current["nonat"]) ?? current["nonat"] ?? "0"),
          log:
            flag(p.log) ??
            (extractSelected(current["log"]) ?? current["log"] ?? "0"),
          sequence:
            p.sequence !== undefined
              ? String(p.sequence)
              : (extractSelected(current["sequence"]) ?? current["sequence"] ?? "100"),
          tagged:
            p.tagged ?? (extractSelected(current["tagged"]) ?? current["tagged"] ?? ""),
          description:
            p.description ?? (extractSelected(current["description"]) ?? current["description"] ?? ""),
        };

        const result = await client.post(
          `/firewall/source_nat/set_rule/${encodeURIComponent(p.uuid)}`,
          { rule: merged },
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_nat_source_delete": {
        const p = SourceNatUuidConfirmSchema.parse(args);
        const result = await client.post(
          `/firewall/source_nat/del_rule/${encodeURIComponent(p.uuid)}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_nat_source_toggle": {
        const p = SourceNatUuidConfirmSchema.parse(args);
        const result = await client.post(
          `/firewall/source_nat/toggle_rule/${encodeURIComponent(p.uuid)}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_nat_apply": {
        ApplySchema.parse(args);
        const result = await client.post("/firewall/source_nat/apply", {});
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown NAT tool: ${name}` }] };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { content: [{ type: "text", text: `Error executing ${name}: ${message}` }] };
  }
}
