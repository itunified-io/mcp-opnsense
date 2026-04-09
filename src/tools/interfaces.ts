import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";
import { SshClient } from "../client/ssh-client.js";

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

const GetInterfaceSchema = z.object({
  interface_name: z.string().min(1, "Interface name is required"),
});

const SlotRegex = /^opt\d+$/;
const DeviceRegex = /^(vlan\d+|[a-z]+\d+(_vlan\d+)?)$/;
const DescrRegex = /^[\w\s\-.,()#:/]{1,120}$/u;

const IfAssignSchema = z.object({
  slot: z.string().regex(SlotRegex, "slot must match /^opt\\d+$/ (e.g. opt1)"),
  if: z
    .string()
    .regex(DeviceRegex, "device must be a VLAN (vlanNN) or a real NIC (e.g. igb0)"),
  descr: z.string().regex(DescrRegex, "invalid description charset").optional(),
});

const IfConfigureSchema = z.object({
  slot: z.string().regex(SlotRegex, "slot must match /^opt\\d+$/"),
  ipv4: z.string().optional(),
  subnet: z.union([z.string(), z.number()]).optional(),
  ipv6: z.string().optional(),
  subnetv6: z.union([z.string(), z.number()]).optional(),
  track6_interface: z.string().optional(),
  track6_prefix_id: z.union([z.string(), z.number()]).optional(),
  descr: z.string().regex(DescrRegex, "invalid description charset").optional(),
  no_filter_reload: z.boolean().optional(),
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
  {
    name: "opnsense_if_assign",
    description:
      "Assign an existing VLAN or NIC device to a free optN slot via SSH. Requires OPNSENSE_SSH_ENABLED=true and the opnsense-helpers/if_assign.php script installed on the target host. Fills the gap where the OPNsense REST API has no 'Interfaces → Assignments' endpoint.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slot: {
          type: "string",
          description: "Target slot (e.g. 'opt1', 'opt2'). Must be free.",
        },
        if: {
          type: "string",
          description:
            "Device to assign (e.g. 'vlan10' for a VLAN or 'igb0' for a real NIC)",
        },
        descr: {
          type: "string",
          description: "Optional friendly description (max 120 chars)",
        },
      },
      required: ["slot", "if"],
    },
  },
  {
    name: "opnsense_if_configure",
    description:
      "Configure IPv4/IPv6 on an already-assigned optN slot via SSH. Supports static, dhcp, dhcp6, track6, and 'none'. Requires OPNSENSE_SSH_ENABLED=true and the opnsense-helpers/if_configure.php script installed on the target host.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slot: {
          type: "string",
          description: "Target slot (must already be assigned, e.g. 'opt1')",
        },
        ipv4: {
          type: "string",
          description:
            "IPv4 address (e.g. '10.10.10.1'), or 'none' / 'dhcp'. Omit to leave IPv4 unchanged.",
        },
        subnet: {
          type: ["string", "number"],
          description: "IPv4 CIDR prefix length (0..32). Required when ipv4 is a literal address.",
        },
        ipv6: {
          type: "string",
          description:
            "IPv6 address, or 'none' / 'dhcp6' / 'track6'. Omit to leave IPv6 unchanged.",
        },
        subnetv6: {
          type: ["string", "number"],
          description: "IPv6 CIDR prefix length (0..128). Required when ipv6 is a literal address.",
        },
        track6_interface: {
          type: "string",
          description: "Parent interface for track6 (e.g. 'wan'). Required when ipv6=track6.",
        },
        track6_prefix_id: {
          type: ["string", "number"],
          description: "Numeric prefix ID for track6 (optional)",
        },
        descr: {
          type: "string",
          description: "Optional friendly description (max 120 chars)",
        },
        no_filter_reload: {
          type: "boolean",
          description:
            "Skip filter_configure() after applying (default false). Useful when batching multiple configures.",
        },
      },
      required: ["slot"],
    },
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

      case "opnsense_if_assign": {
        const ssh = requireSshClient();
        const parsed = IfAssignSchema.parse(args);
        const cliArgs = [`--slot=${parsed.slot}`, `--if=${parsed.if}`];
        if (parsed.descr !== undefined) {
          cliArgs.push(`--descr=${parsed.descr}`);
        }
        const { response, exitCode, stderr } = await ssh.runHelper(
          "if_assign.php",
          cliArgs,
        );
        return renderHelperResult(response, exitCode, stderr);
      }

      case "opnsense_if_configure": {
        const ssh = requireSshClient();
        const parsed = IfConfigureSchema.parse(args);
        const cliArgs: string[] = [`--slot=${parsed.slot}`];
        if (parsed.ipv4 !== undefined) cliArgs.push(`--ipv4=${parsed.ipv4}`);
        if (parsed.subnet !== undefined) cliArgs.push(`--subnet=${parsed.subnet}`);
        if (parsed.ipv6 !== undefined) cliArgs.push(`--ipv6=${parsed.ipv6}`);
        if (parsed.subnetv6 !== undefined) cliArgs.push(`--subnetv6=${parsed.subnetv6}`);
        if (parsed.track6_interface !== undefined) {
          cliArgs.push(`--track6-interface=${parsed.track6_interface}`);
        }
        if (parsed.track6_prefix_id !== undefined) {
          cliArgs.push(`--track6-prefix-id=${parsed.track6_prefix_id}`);
        }
        if (parsed.descr !== undefined) cliArgs.push(`--descr=${parsed.descr}`);
        if (parsed.no_filter_reload === true) cliArgs.push("--no-filter-reload");

        const { response, exitCode, stderr } = await ssh.runHelper(
          "if_configure.php",
          cliArgs,
        );
        return renderHelperResult(response, exitCode, stderr);
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

// ---------------------------------------------------------------------------
// SSH-backed helper wiring
// ---------------------------------------------------------------------------

/**
 * Lazy SSH client singleton. Constructed on first use so that tests and
 * non-SSH deployments don't pay the file-existence cost at module load.
 */
let sshClientInstance: SshClient | null | undefined;

export function requireSshClient(): SshClient {
  if (sshClientInstance === undefined) {
    sshClientInstance = SshClient.fromEnv();
  }
  if (sshClientInstance === null) {
    throw new Error(
      "SSH-backed interface tools require OPNSENSE_SSH_ENABLED=true plus " +
        "OPNSENSE_SSH_HOST / OPNSENSE_SSH_USER / OPNSENSE_SSH_KEY_PATH / " +
        "OPNSENSE_SSH_KNOWN_HOSTS. See README 'SSH-backed interface assignment'.",
    );
  }
  return sshClientInstance;
}

/** Test-only: reset the cached SSH client singleton. */
export function _resetSshClientForTesting(): void {
  sshClientInstance = undefined;
}

interface HelperResponseShape {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

function renderHelperResult(
  response: HelperResponseShape,
  exitCode: number,
  stderr: string,
): { content: Array<{ type: "text"; text: string }> } {
  const payload: Record<string, unknown> = {
    ...response,
    exit_code: exitCode,
  };
  if (!response.ok && stderr.trim() !== "") {
    payload.stderr_tail = stderr.trim().split("\n").slice(-3).join("\n");
  }
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}
