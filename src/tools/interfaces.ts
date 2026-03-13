import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

const GetInterfaceSchema = z.object({
  interface_name: z.string().min(1, "Interface name is required"),
});

// ---------------------------------------------------------------------------
// Tool definitions (for ListTools)
// ---------------------------------------------------------------------------

export const interfacesToolDefinitions = [
  {
    name: "opnsense_if_list",
    description: "List all network interface names and their device mappings",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_if_get",
    description:
      "Get detailed configuration for a specific network interface (IP addresses, status, MTU, etc.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        interface_name: {
          type: "string",
          description: "Interface name (e.g. 'lan', 'wan', 'opt1')",
        },
      },
      required: ["interface_name"],
    },
  },
  {
    name: "opnsense_if_stats",
    description:
      "Get traffic statistics for all interfaces (bytes, packets, errors, collisions)",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function handleInterfacesTool(
  name: string,
  args: Record<string, unknown>,
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    switch (name) {
      case "opnsense_if_list": {
        const result = await client.get("/diagnostics/interface/getInterfaceNames");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_if_get": {
        const parsed = GetInterfaceSchema.parse(args);
        const input = parsed.interface_name.toLowerCase();

        // getInterfaceNames returns {device: friendly} e.g. {re0: "LAN", em0: "WAN"}
        // Resolve friendly name (e.g. "lan") to device name (e.g. "re0")
        const nameMap = await client.get<Record<string, string>>(
          "/diagnostics/interface/getInterfaceNames",
        );

        // Search: input could be a friendly name ("lan") or device name ("re0")
        let deviceName = parsed.interface_name;
        for (const [device, friendly] of Object.entries(nameMap)) {
          if (friendly.toLowerCase() === input || device.toLowerCase() === input) {
            deviceName = device;
            break;
          }
        }

        const allInterfaces = await client.get<Record<string, unknown>>(
          "/diagnostics/interface/getInterfaceConfig",
        );

        const interfaceData = allInterfaces[deviceName];
        if (!interfaceData) {
          const available = Object.entries(nameMap)
            .map(([device, friendly]) => `${friendly.toLowerCase()} (${device})`)
            .join(", ");
          return {
            content: [
              {
                type: "text",
                text: `Interface '${parsed.interface_name}' not found. Available: ${available}`,
              },
            ],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(interfaceData, null, 2) }] };
      }

      case "opnsense_if_stats": {
        const result = await client.get("/diagnostics/interface/getInterfaceStatistics");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown interfaces tool: ${name}` }],
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${message}` }],
    };
  }
}
