import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadSecretsFile } from './config/secrets-file.js';
import { loadFromVault } from './config/vault-loader.js';
import { OPNsenseClient } from './client/opnsense-client.js';

// Secret loading order (precedence: first wins):
//   1. process.env (explicit shell / MCP config) — always highest
//   2. Vault AppRole (opportunistic, if NAS_VAULT_* is configured)
//   3. MCP_SECRETS_FILE
// loadSecretsFile / loadFromVault are both additive and only populate env
// vars that are currently undefined/empty.
loadSecretsFile();
await loadFromVault({
  kvPath: 'opnsense/bifrost',
  mapping: {
    url: 'OPNSENSE_URL',
    api_key: 'OPNSENSE_API_KEY',
    api_secret: 'OPNSENSE_API_SECRET',
  },
});
import { dnsToolDefinitions, handleDnsTool } from './tools/dns.js';
import { firewallToolDefinitions, handleFirewallTool } from './tools/firewall.js';
import { diagnosticsToolDefinitions, handleDiagnosticsTool } from './tools/diagnostics.js';
import { interfacesToolDefinitions, handleInterfacesTool } from './tools/interfaces.js';
import { dhcpToolDefinitions, handleDhcpTool } from './tools/dhcp.js';
import { systemToolDefinitions, handleSystemTool } from './tools/system.js';
import { acmeToolDefinitions, handleAcmeTool } from './tools/acme.js';
import { firmwareToolDefinitions, handleFirmwareTool } from './tools/firmware.js';
import { routingToolDefinitions, handleRoutingTool } from './tools/routing.js';
import { vlanToolDefinitions, handleVlanTool } from './tools/vlan.js';
import { tailscaleToolDefinitions, handleTailscaleTool } from './tools/tailscale.js';
import { natToolDefinitions, handleNatTool } from './tools/nat.js';

const allToolDefinitions = [
  ...dnsToolDefinitions,
  ...firewallToolDefinitions,
  ...diagnosticsToolDefinitions,
  ...interfacesToolDefinitions,
  ...dhcpToolDefinitions,
  ...systemToolDefinitions,
  ...acmeToolDefinitions,
  ...firmwareToolDefinitions,
  ...routingToolDefinitions,
  ...vlanToolDefinitions,
  ...tailscaleToolDefinitions,
  ...natToolDefinitions,
];

const toolHandlers = new Map<
  string,
  (name: string, args: Record<string, unknown>, client: OPNsenseClient) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
>();

for (const def of dnsToolDefinitions) toolHandlers.set(def.name, handleDnsTool);
for (const def of firewallToolDefinitions) toolHandlers.set(def.name, handleFirewallTool);
for (const def of diagnosticsToolDefinitions) toolHandlers.set(def.name, handleDiagnosticsTool);
for (const def of interfacesToolDefinitions) toolHandlers.set(def.name, handleInterfacesTool);
for (const def of dhcpToolDefinitions) toolHandlers.set(def.name, handleDhcpTool);
for (const def of systemToolDefinitions) toolHandlers.set(def.name, handleSystemTool);
for (const def of acmeToolDefinitions) toolHandlers.set(def.name, handleAcmeTool);
for (const def of firmwareToolDefinitions) toolHandlers.set(def.name, handleFirmwareTool);
for (const def of routingToolDefinitions) toolHandlers.set(def.name, handleRoutingTool);
for (const def of vlanToolDefinitions) toolHandlers.set(def.name, handleVlanTool);
for (const def of tailscaleToolDefinitions) toolHandlers.set(def.name, handleTailscaleTool);
for (const def of natToolDefinitions) toolHandlers.set(def.name, handleNatTool);

const server = new Server(
  { name: 'mcp-opnsense', version: '2026.5.6-1' },
  { capabilities: { tools: {} } }
);

const client = OPNsenseClient.fromEnv();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allToolDefinitions,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = toolHandlers.get(name);

  if (!handler) {
    return {
      content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  return handler(name, (args ?? {}) as Record<string, unknown>, client);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});
