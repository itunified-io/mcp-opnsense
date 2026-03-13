import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { OPNsenseClient } from './client/opnsense-client.js';
import { dnsToolDefinitions, handleDnsTool } from './tools/dns.js';
import { firewallToolDefinitions, handleFirewallTool } from './tools/firewall.js';
import { diagnosticsToolDefinitions, handleDiagnosticsTool } from './tools/diagnostics.js';
import { interfacesToolDefinitions, handleInterfacesTool } from './tools/interfaces.js';
import { dhcpToolDefinitions, handleDhcpTool } from './tools/dhcp.js';
import { systemToolDefinitions, handleSystemTool } from './tools/system.js';

const allToolDefinitions = [
  ...dnsToolDefinitions,
  ...firewallToolDefinitions,
  ...diagnosticsToolDefinitions,
  ...interfacesToolDefinitions,
  ...dhcpToolDefinitions,
  ...systemToolDefinitions,
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

const server = new Server(
  { name: 'mcp-opnsense', version: '2026.3.13' },
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
