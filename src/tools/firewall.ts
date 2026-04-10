import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";
import {
  UuidSchema,
  FirewallActionSchema,
  DirectionSchema,
  ProtocolSchema,
} from "../utils/validation.js";

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

const AddRuleSchema = z.object({
  action: FirewallActionSchema,
  direction: DirectionSchema,
  interface: z.string().optional(),
  protocol: ProtocolSchema.optional(),
  source_net: z.string().optional(),
  destination_net: z.string().optional(),
  destination_port: z.string().optional(),
  description: z.string().optional(),
});

const UpdateRuleSchema = AddRuleSchema.extend({
  uuid: UuidSchema,
});

const DeleteRuleSchema = z.object({
  uuid: UuidSchema,
});

const ToggleRuleSchema = z.object({
  uuid: UuidSchema,
  enabled: z.enum(["0", "1"]),
});

const ReorderRuleSchema = z.object({
  uuid: UuidSchema,
  sequence: z.number().int().min(1).max(1000000),
});

const DriftCheckSchema = z.object({
  description_prefix_regex: z.string().optional(),
  category: z.string().optional(),
});

const ManageAliasSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().min(1, "Alias name is required"),
    type: z.string().min(1, "Alias type is required"),
    content: z.string().min(1, "Alias content is required"),
    description: z.string().optional(),
  }),
  z.object({
    action: z.literal("update"),
    uuid: UuidSchema,
    name: z.string().optional(),
    type: z.string().optional(),
    content: z.string().optional(),
    description: z.string().optional(),
  }),
  z.object({
    action: z.literal("delete"),
    uuid: UuidSchema,
  }),
]);

// ---------------------------------------------------------------------------
// Tool definitions (for ListTools)
// ---------------------------------------------------------------------------

export const firewallToolDefinitions = [
  {
    name: "opnsense_fw_list_rules",
    description: "List all firewall filter rules",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_fw_add_rule",
    description:
      "Add a new firewall filter rule. Run opnsense_fw_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["pass", "block", "reject"],
          description: "Rule action",
        },
        direction: {
          type: "string",
          enum: ["in", "out"],
          description: "Traffic direction",
        },
        interface: { type: "string", description: "Interface name (e.g. 'lan', 'wan')" },
        protocol: {
          type: "string",
          enum: ["TCP", "UDP", "ICMP", "any"],
          description: "Protocol",
        },
        source_net: {
          type: "string",
          description: "Source network (CIDR, alias, or 'any')",
        },
        destination_net: {
          type: "string",
          description: "Destination network (CIDR, alias, or 'any')",
        },
        destination_port: {
          type: "string",
          description: "Destination port or range (e.g. '443', '80-443')",
        },
        description: { type: "string", description: "Rule description" },
      },
      required: ["action", "direction"],
    },
  },
  {
    name: "opnsense_fw_update_rule",
    description:
      "Update an existing firewall filter rule by UUID. Run opnsense_fw_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the rule to update" },
        action: {
          type: "string",
          enum: ["pass", "block", "reject"],
          description: "Rule action",
        },
        direction: {
          type: "string",
          enum: ["in", "out"],
          description: "Traffic direction",
        },
        interface: { type: "string", description: "Interface name" },
        protocol: {
          type: "string",
          enum: ["TCP", "UDP", "ICMP", "any"],
          description: "Protocol",
        },
        source_net: { type: "string", description: "Source network" },
        destination_net: { type: "string", description: "Destination network" },
        destination_port: { type: "string", description: "Destination port or range" },
        description: { type: "string", description: "Rule description" },
      },
      required: ["uuid", "action", "direction"],
    },
  },
  {
    name: "opnsense_fw_delete_rule",
    description:
      "Delete a firewall filter rule by UUID. Run opnsense_fw_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the rule to delete" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_fw_toggle_rule",
    description:
      "Enable or disable a firewall rule by UUID. Run opnsense_fw_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the rule to toggle" },
        enabled: {
          type: "string",
          enum: ["0", "1"],
          description: "1 to enable, 0 to disable",
        },
      },
      required: ["uuid", "enabled"],
    },
  },
  {
    name: "opnsense_fw_list_aliases",
    description: "List all firewall aliases (host groups, networks, ports, URLs)",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_fw_manage_alias",
    description:
      "Create, update, or delete a firewall alias. Run opnsense_fw_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["create", "update", "delete"],
          description: "Action to perform",
        },
        uuid: {
          type: "string",
          description: "UUID of alias (required for update/delete)",
        },
        name: {
          type: "string",
          description: "Alias name (required for create)",
        },
        type: {
          type: "string",
          description: "Alias type: host, network, port, url, etc. (required for create)",
        },
        content: {
          type: "string",
          description: "Alias content — newline-separated values (required for create)",
        },
        description: { type: "string", description: "Alias description" },
      },
      required: ["action"],
    },
  },
  {
    name: "opnsense_fw_apply",
    description: "Apply pending firewall configuration changes",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_fw_reorder_rules",
    description:
      "Change the sequence (ordering) of a firewall filter rule by UUID. Rules with lower sequence values are evaluated first. Use this to enforce whitelist-before-deny ordering. Run opnsense_fw_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the rule to reorder" },
        sequence: {
          type: "number",
          description:
            "New sequence value (positive integer). Lower values are evaluated first.",
        },
      },
      required: ["uuid", "sequence"],
    },
  },
  {
    name: "opnsense_fw_drift_check",
    description:
      "Audit firewall filter rules for description hygiene. Returns rules whose description does not match the given regex (default: '^#\\d+:' — issue-reference prefix) and rules with empty descriptions. Read-only.",
    inputSchema: {
      type: "object" as const,
      properties: {
        description_prefix_regex: {
          type: "string",
          description:
            "Regex that rule descriptions MUST match (default: '^#\\d+:' — requires a GitHub issue reference like '#361: ...')",
        },
        category: {
          type: "string",
          description:
            "Optional category name to restrict the audit to rules in that category (exact match)",
        },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the selected key from an OPNsense multi-select field.
 *
 * getRule returns multi-select fields as:
 *   { "pass": { "value": "Pass", "selected": 1 }, "block": { "value": "Block", "selected": 0 } }
 *
 * setRule expects the flat key string, e.g. "pass".
 *
 * Handles both numeric (selected: 1) and string (selected: "1") variants.
 * Returns undefined if the field is not a recognized multi-select object.
 */
export function extractSelected(field: unknown): string | undefined {
  if (typeof field === "string") return field;
  if (field && typeof field === "object" && !Array.isArray(field)) {
    const entries = Object.entries(field as Record<string, unknown>);
    const selected: string[] = [];
    for (const [k, v] of entries) {
      if (
        v &&
        typeof v === "object" &&
        ((v as Record<string, unknown>).selected === 1 ||
          (v as Record<string, unknown>).selected === "1")
      ) {
        selected.push(k);
      }
    }
    if (selected.length > 0) return selected.join(",");
    // Not a multi-select object (no {selected} children) — return undefined
    return undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function handleFirewallTool(
  name: string,
  args: Record<string, unknown>,
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    switch (name) {
      case "opnsense_fw_list_rules": {
        const result = await client.get("/firewall/filter/searchRule");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_fw_add_rule": {
        const parsed = AddRuleSchema.parse(args);
        const result = await client.post("/firewall/filter/addRule", {
          rule: {
            enabled: "1",
            action: parsed.action,
            direction: parsed.direction,
            interface: parsed.interface ?? "",
            ipprotocol: "inet",
            protocol: parsed.protocol ?? "any",
            source_net: parsed.source_net ?? "any",
            destination_net: parsed.destination_net ?? "any",
            destination_port: parsed.destination_port ?? "",
            description: parsed.description ?? "",
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_fw_update_rule": {
        const parsed = UpdateRuleSchema.parse(args);
        const result = await client.post(`/firewall/filter/setRule/${parsed.uuid}`, {
          rule: {
            enabled: "1",
            action: parsed.action,
            direction: parsed.direction,
            interface: parsed.interface ?? "",
            ipprotocol: "inet",
            protocol: parsed.protocol ?? "any",
            source_net: parsed.source_net ?? "any",
            destination_net: parsed.destination_net ?? "any",
            destination_port: parsed.destination_port ?? "",
            description: parsed.description ?? "",
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_fw_delete_rule": {
        const { uuid } = DeleteRuleSchema.parse(args);
        const result = await client.post(`/firewall/filter/delRule/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_fw_toggle_rule": {
        const parsed = ToggleRuleSchema.parse(args);
        const result = await client.post(
          `/firewall/filter/toggleRule/${parsed.uuid}/${parsed.enabled}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_fw_list_aliases": {
        const result = await client.get("/firewall/alias/searchItem");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_fw_manage_alias": {
        const parsed = ManageAliasSchema.parse(args);

        switch (parsed.action) {
          case "create": {
            const result = await client.post("/firewall/alias/addItem", {
              alias: {
                enabled: "1",
                name: parsed.name,
                type: parsed.type,
                content: parsed.content,
                description: parsed.description ?? "",
              },
            });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
          case "update": {
            const payload: Record<string, string> = {};
            if (parsed.name !== undefined) payload["name"] = parsed.name;
            if (parsed.type !== undefined) payload["type"] = parsed.type;
            if (parsed.content !== undefined) payload["content"] = parsed.content;
            if (parsed.description !== undefined) payload["description"] = parsed.description;

            const result = await client.post(`/firewall/alias/setItem/${parsed.uuid}`, {
              alias: payload,
            });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
          case "delete": {
            const result = await client.post(`/firewall/alias/delItem/${parsed.uuid}`);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
        }
        break;
      }

      case "opnsense_fw_apply": {
        const result = await client.post("/firewall/filter/apply");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_fw_reorder_rules": {
        const parsed = ReorderRuleSchema.parse(args);
        // OPNsense core filter rules carry a `sequence` field that controls
        // evaluation order. Read the existing rule, extract the core fields
        // that setRule accepts, and POST back with the new sequence.
        //
        // Why not roundtrip the full getRule response? Because getRule returns
        // multi-select fields as {key: {value, selected}} objects while setRule
        // expects flat strings. The generic flattening approach is fragile — some
        // fields (source_net, log, gateway, etc.) have structures the flattener
        // doesn't handle. Instead, extract only the known core fields.
        const existing = await client.get<{ rule?: Record<string, unknown> }>(
          `/firewall/filter/getRule/${parsed.uuid}`,
        );
        if (!existing?.rule) {
          return {
            content: [
              { type: "text", text: `Rule ${parsed.uuid} not found` },
            ],
          };
        }

        const r = existing.rule;
        const result = await client.post(
          `/firewall/filter/setRule/${parsed.uuid}`,
          {
            rule: {
              enabled: extractSelected(r["enabled"]) ?? "1",
              action: extractSelected(r["action"]) ?? "pass",
              direction: extractSelected(r["direction"]) ?? "in",
              interface: extractSelected(r["interface"]) ?? "",
              ipprotocol: extractSelected(r["ipprotocol"]) ?? "inet",
              protocol: extractSelected(r["protocol"]) ?? "any",
              source_net: typeof r["source_net"] === "string" ? r["source_net"] : "any",
              source_not: extractSelected(r["source_not"]) ?? "0",
              source_port: typeof r["source_port"] === "string" ? r["source_port"] : "",
              destination_net: typeof r["destination_net"] === "string" ? r["destination_net"] : "any",
              destination_not: extractSelected(r["destination_not"]) ?? "0",
              destination_port: typeof r["destination_port"] === "string" ? r["destination_port"] : "",
              log: extractSelected(r["log"]) ?? "0",
              description: typeof r["description"] === "string" ? r["description"] : "",
              sequence: String(parsed.sequence),
            },
          },
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_fw_drift_check": {
        const parsed = DriftCheckSchema.parse(args);
        const prefixRegexSource = parsed.description_prefix_regex ?? "^#\\d+:";
        let prefixRegex: RegExp;
        try {
          prefixRegex = new RegExp(prefixRegexSource);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "invalid regex";
          return {
            content: [
              { type: "text", text: `Invalid description_prefix_regex: ${msg}` },
            ],
          };
        }

        const searchResult = await client.get<{
          rows?: Array<Record<string, unknown>>;
        }>("/firewall/filter/searchRule");
        const rows = searchResult?.rows ?? [];

        const missingPrefix: Array<Record<string, unknown>> = [];
        const emptyDescription: Array<Record<string, unknown>> = [];
        let inspected = 0;

        for (const row of rows) {
          const category = String(row["category"] ?? "");
          if (parsed.category && category !== parsed.category) continue;
          inspected++;
          const description = String(row["description"] ?? "");
          if (description.trim() === "") {
            emptyDescription.push({
              uuid: row["uuid"],
              interface: row["interface"],
              category,
              action: row["action"],
            });
            continue;
          }
          if (!prefixRegex.test(description)) {
            missingPrefix.push({
              uuid: row["uuid"],
              interface: row["interface"],
              category,
              action: row["action"],
              description,
            });
          }
        }

        const report = {
          regex: prefixRegexSource,
          category_filter: parsed.category ?? null,
          total_rules: rows.length,
          inspected,
          violations: {
            empty_description: emptyDescription.length,
            missing_prefix: missingPrefix.length,
          },
          empty_description_rules: emptyDescription,
          missing_prefix_rules: missingPrefix,
        };
        return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown firewall tool: ${name}` }],
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${message}` }],
    };
  }

  // Unreachable but satisfies TypeScript control-flow analysis
  return { content: [{ type: "text", text: `Unhandled firewall tool: ${name}` }] };
}
