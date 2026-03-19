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

const SubnetSchema = z.object({
  subnet: z.string().min(1, "Subnet in CIDR notation required (e.g., 10.10.0.0/24)"),
  pools: z.string().optional().describe("Pool range (e.g., 10.10.0.100-10.10.0.199)"),
  description: z.string().optional(),
  option_data_autocollect: z.string().optional().describe("Auto collect option data (0 or 1, default: 1)"),
  router: z.string().optional().describe("Default gateway IP"),
  dns_servers: z.string().optional().describe("Comma-separated DNS server IPs"),
  domain_name: z.string().optional().describe("Domain name for clients"),
  domain_search: z.string().optional().describe("Domain search list (comma-separated)"),
  ntp_servers: z.string().optional().describe("Comma-separated NTP server IPs"),
});

const SubnetUpdateSchema = SubnetSchema.extend({
  uuid: UuidSchema,
});

const SubnetDeleteSchema = z.object({
  uuid: UuidSchema,
});

// ---------------------------------------------------------------------------
// DHCP backend detection — Kea vs ISC (legacy)
// ---------------------------------------------------------------------------

type DhcpBackend = "kea" | "isc";

/**
 * Detect whether the OPNsense instance runs Kea DHCP or ISC DHCP (legacy).
 *
 * Strategy: try the Kea subnet search endpoint. If it returns rows, Kea is
 * active. If it throws (plugin not installed) or returns an empty/missing
 * rows array, fall back to ISC.
 */
async function detectDhcpBackend(client: OPNsenseClient): Promise<DhcpBackend> {
  try {
    const result = await client.get<{
      rows?: Array<{ uuid: string; subnet: string }>;
    }>("/kea/dhcpv4/search_subnet");

    if (result.rows && result.rows.length > 0) {
      return "kea";
    }
    // Kea plugin present but no subnets configured — fall back to ISC
    return "isc";
  } catch {
    // Kea API not available (404 / plugin not installed) — use ISC
    return "isc";
  }
}

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
    description: "List all static DHCP mappings (MAC-to-IP reservations). Supports both Kea DHCP and ISC DHCP (legacy) backends — auto-detected.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_dhcp_add_static",
    description:
      "Add a static DHCP mapping (MAC-to-IP reservation). Supports both Kea DHCP and ISC DHCP (legacy) backends — auto-detected. Requires DHCP service restart to take effect.",
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
    description: "Delete a static DHCP mapping by UUID. Supports both Kea DHCP and ISC DHCP (legacy) backends — auto-detected.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the static mapping to delete" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_kea_subnet_list",
    description: "List all Kea DHCPv4 subnets with their pools, options, and reservation counts.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_kea_subnet_get",
    description: "Get detailed configuration of a specific Kea DHCPv4 subnet by UUID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "Subnet UUID" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_kea_subnet_create",
    description: "Create a new Kea DHCPv4 subnet. Run opnsense_kea_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        subnet: { type: "string", description: "Subnet in CIDR notation (e.g., 10.10.0.0/24)" },
        pools: { type: "string", description: "Pool range (e.g., 10.10.0.100-10.10.0.199)" },
        description: { type: "string", description: "Optional description" },
        option_data_autocollect: { type: "string", description: "Auto collect option data (0 or 1, default: 1)" },
        router: { type: "string", description: "Default gateway IP" },
        dns_servers: { type: "string", description: "Comma-separated DNS server IPs" },
        domain_name: { type: "string", description: "Domain name for clients" },
        domain_search: { type: "string", description: "Domain search list (comma-separated)" },
        ntp_servers: { type: "string", description: "Comma-separated NTP server IPs" },
      },
      required: ["subnet"],
    },
  },
  {
    name: "opnsense_kea_subnet_update",
    description: "Update an existing Kea DHCPv4 subnet. Run opnsense_kea_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "Subnet UUID" },
        subnet: { type: "string", description: "Subnet in CIDR notation" },
        pools: { type: "string", description: "Pool range (e.g., 10.10.0.100-10.10.0.199)" },
        description: { type: "string", description: "Optional description" },
        option_data_autocollect: { type: "string", description: "Auto collect option data (0 or 1)" },
        router: { type: "string", description: "Default gateway IP" },
        dns_servers: { type: "string", description: "Comma-separated DNS server IPs" },
        domain_name: { type: "string", description: "Domain name for clients" },
        domain_search: { type: "string", description: "Domain search list (comma-separated)" },
        ntp_servers: { type: "string", description: "Comma-separated NTP server IPs" },
      },
      required: ["uuid", "subnet"],
    },
  },
  {
    name: "opnsense_kea_subnet_delete",
    description: "Delete a Kea DHCPv4 subnet by UUID. Run opnsense_kea_apply afterwards to activate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "Subnet UUID to delete" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_kea_apply",
    description: "Apply pending Kea DHCP configuration changes (reconfigure service). Run after subnet or reservation changes.",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

// ---------------------------------------------------------------------------
// Kea DHCP helpers
// ---------------------------------------------------------------------------

async function keaListStatic(
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await client.get("/kea/dhcpv4/search_reservation");
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function keaAddStatic(
  client: OPNsenseClient,
  parsed: z.infer<typeof AddStaticMapSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const subnets = await client.get<{
    rows?: Array<{ uuid: string; subnet: string }>;
  }>("/kea/dhcpv4/search_subnet");

  let subnetUuid = "";
  for (const s of subnets.rows ?? []) {
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
        text: `No Kea DHCP subnet found for IP ${parsed.ipaddr}. Available subnets: ${available || "none"}. Kea DHCP must be configured with at least one subnet to manage static reservations.`,
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

async function keaDeleteStatic(
  client: OPNsenseClient,
  uuid: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await client.post(`/kea/dhcpv4/del_reservation/${uuid}`);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

// ---------------------------------------------------------------------------
// Kea DHCP subnet helpers
// ---------------------------------------------------------------------------

async function keaListSubnets(
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await client.get("/kea/dhcpv4/search_subnet");
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function keaGetSubnet(
  client: OPNsenseClient,
  uuid: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await client.get(`/kea/dhcpv4/get_subnet/${uuid}`);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function keaAddSubnet(
  client: OPNsenseClient,
  parsed: z.infer<typeof SubnetSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const subnet: Record<string, string> = {
    subnet: parsed.subnet,
  };
  if (parsed.pools) subnet.pools = parsed.pools;
  if (parsed.description) subnet.description = parsed.description;
  if (parsed.option_data_autocollect) subnet.option_data_autocollect = parsed.option_data_autocollect;
  if (parsed.router) subnet.option_routers = parsed.router;
  if (parsed.dns_servers) subnet.option_domain_name_servers = parsed.dns_servers;
  if (parsed.domain_name) subnet.option_domain_name = parsed.domain_name;
  if (parsed.domain_search) subnet.option_domain_search = parsed.domain_search;
  if (parsed.ntp_servers) subnet.option_ntp_servers = parsed.ntp_servers;

  const result = await client.post("/kea/dhcpv4/add_subnet", { subnet });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function keaUpdateSubnet(
  client: OPNsenseClient,
  parsed: z.infer<typeof SubnetUpdateSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const subnet: Record<string, string> = {
    subnet: parsed.subnet,
  };
  if (parsed.pools !== undefined) subnet.pools = parsed.pools;
  if (parsed.description !== undefined) subnet.description = parsed.description;
  if (parsed.option_data_autocollect !== undefined) subnet.option_data_autocollect = parsed.option_data_autocollect;
  if (parsed.router !== undefined) subnet.option_routers = parsed.router;
  if (parsed.dns_servers !== undefined) subnet.option_domain_name_servers = parsed.dns_servers;
  if (parsed.domain_name !== undefined) subnet.option_domain_name = parsed.domain_name;
  if (parsed.domain_search !== undefined) subnet.option_domain_search = parsed.domain_search;
  if (parsed.ntp_servers !== undefined) subnet.option_ntp_servers = parsed.ntp_servers;

  const result = await client.post(`/kea/dhcpv4/set_subnet/${parsed.uuid}`, { subnet });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function keaDeleteSubnet(
  client: OPNsenseClient,
  uuid: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await client.post(`/kea/dhcpv4/del_subnet/${uuid}`);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function keaApply(
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await client.post("/kea/service/reconfigure");
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

// ---------------------------------------------------------------------------
// ISC DHCP helpers (legacy)
// ---------------------------------------------------------------------------

async function iscListStatic(
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await client.get("/dhcpv4/leases/searchStaticMap");
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function iscAddStatic(
  client: OPNsenseClient,
  parsed: z.infer<typeof AddStaticMapSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await client.post("/dhcpv4/leases/addStaticMap", {
    staticmap: {
      mac: parsed.mac,
      ipaddr: parsed.ipaddr,
      hostname: parsed.hostname ?? "",
      descr: parsed.description ?? "",
    },
  });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function iscDeleteStatic(
  client: OPNsenseClient,
  uuid: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await client.post(`/dhcpv4/leases/delStaticMap/${uuid}`);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

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
        const backend = await detectDhcpBackend(client);
        if (backend === "kea") {
          return await keaListStatic(client);
        }
        return await iscListStatic(client);
      }

      case "opnsense_dhcp_add_static": {
        const parsed = AddStaticMapSchema.parse(args);
        const backend = await detectDhcpBackend(client);
        if (backend === "kea") {
          return await keaAddStatic(client, parsed);
        }
        return await iscAddStatic(client, parsed);
      }

      case "opnsense_dhcp_delete_static": {
        const { uuid } = DeleteStaticMapSchema.parse(args);
        const backend = await detectDhcpBackend(client);
        if (backend === "kea") {
          return await keaDeleteStatic(client, uuid);
        }
        return await iscDeleteStatic(client, uuid);
      }

      case "opnsense_kea_subnet_list":
        return await keaListSubnets(client);

      case "opnsense_kea_subnet_get": {
        const { uuid } = z.object({ uuid: UuidSchema }).parse(args);
        return await keaGetSubnet(client, uuid);
      }

      case "opnsense_kea_subnet_create": {
        const parsed = SubnetSchema.parse(args);
        return await keaAddSubnet(client, parsed);
      }

      case "opnsense_kea_subnet_update": {
        const parsed = SubnetUpdateSchema.parse(args);
        return await keaUpdateSubnet(client, parsed);
      }

      case "opnsense_kea_subnet_delete": {
        const { uuid } = SubnetDeleteSchema.parse(args);
        return await keaDeleteSubnet(client, uuid);
      }

      case "opnsense_kea_apply":
        return await keaApply(client);

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
