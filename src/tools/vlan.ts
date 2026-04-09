import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";
import { UuidSchema } from "../utils/validation.js";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const VlanCreateSchema = z.object({
  parent_interface: z
    .string()
    .min(1, "Parent interface is required (e.g. 're0', 'igb0')"),
  vlan_tag: z.number().int().min(1).max(4094),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(7).optional(),
});

const VlanUpdateSchema = z.object({
  uuid: UuidSchema,
  parent_interface: z.string().min(1).optional(),
  vlan_tag: z.number().int().min(1).max(4094).optional(),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(7).optional(),
});

const VlanDeleteSchema = z.object({
  uuid: UuidSchema,
});

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const vlanToolDefinitions = [
  {
    name: "opnsense_vlan_list",
    description:
      "List all configured 802.1Q VLAN interfaces (parent interface, VLAN tag, description, priority)",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_vlan_create",
    description:
      "Create a new 802.1Q VLAN interface on a parent interface. After create, run opnsense_if_assign to bind the VLAN to a logical interface (opt1, opt2, ...) and opnsense_if_configure to assign an IP.",
    inputSchema: {
      type: "object" as const,
      properties: {
        parent_interface: {
          type: "string",
          description: "Parent physical interface device name (e.g. 're0', 'igb0')",
        },
        vlan_tag: {
          type: "number",
          description: "802.1Q VLAN ID (1-4094)",
        },
        description: {
          type: "string",
          description: "Human-readable description of the VLAN",
        },
        priority: {
          type: "number",
          description: "802.1p priority (0-7, default 0)",
        },
      },
      required: ["parent_interface", "vlan_tag"],
    },
  },
  {
    name: "opnsense_vlan_update",
    description:
      "Update an existing VLAN interface by UUID. Only provided fields are changed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the VLAN to update" },
        parent_interface: {
          type: "string",
          description: "Parent physical interface device name",
        },
        vlan_tag: { type: "number", description: "802.1Q VLAN ID (1-4094)" },
        description: { type: "string", description: "Description" },
        priority: { type: "number", description: "802.1p priority (0-7)" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_vlan_delete",
    description:
      "Delete a VLAN interface by UUID. Fails if the VLAN is still assigned to a logical interface — unassign it first via opnsense_if_assign.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the VLAN to delete" },
      },
      required: ["uuid"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function handleVlanTool(
  name: string,
  args: Record<string, unknown>,
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    switch (name) {
      case "opnsense_vlan_list": {
        const result = await client.get("/interfaces/vlan_settings/searchItem");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_vlan_create": {
        const parsed = VlanCreateSchema.parse(args);
        const result = await client.post("/interfaces/vlan_settings/addItem", {
          vlan: {
            if: parsed.parent_interface,
            tag: String(parsed.vlan_tag),
            descr: parsed.description ?? "",
            pcp: String(parsed.priority ?? 0),
            vlanif: "",
          },
        });
        // Trigger reconfigure so the tagged interface becomes available
        await client.post("/interfaces/vlan_settings/reconfigure");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_vlan_update": {
        const parsed = VlanUpdateSchema.parse(args);
        const payload: Record<string, string> = {};
        if (parsed.parent_interface !== undefined) payload["if"] = parsed.parent_interface;
        if (parsed.vlan_tag !== undefined) payload["tag"] = String(parsed.vlan_tag);
        if (parsed.description !== undefined) payload["descr"] = parsed.description;
        if (parsed.priority !== undefined) payload["pcp"] = String(parsed.priority);

        const result = await client.post(
          `/interfaces/vlan_settings/setItem/${parsed.uuid}`,
          { vlan: payload },
        );
        await client.post("/interfaces/vlan_settings/reconfigure");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_vlan_delete": {
        const { uuid } = VlanDeleteSchema.parse(args);
        const result = await client.post(`/interfaces/vlan_settings/delItem/${uuid}`);
        await client.post("/interfaces/vlan_settings/reconfigure");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown vlan tool: ${name}` }],
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${message}` }],
    };
  }
}
