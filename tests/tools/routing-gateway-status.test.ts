import { describe, it, expect, vi } from 'vitest';
import { routingToolDefinitions, handleRoutingTool } from '../../src/tools/routing.js';
import type { OPNsenseClient } from '../../src/client/opnsense-client.js';

function mockClient(overrides: Partial<OPNsenseClient> = {}): OPNsenseClient {
  return {
    get: vi.fn().mockResolvedValue({ items: [] }),
    post: vi.fn().mockResolvedValue({ status: 'ok' }),
    delete: vi.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  } as unknown as OPNsenseClient;
}

describe('Routing gateway status tool', () => {
  it('exposes opnsense_route_gateway_status definition', () => {
    const tool = routingToolDefinitions.find((t) => t.name === 'opnsense_route_gateway_status');
    expect(tool).toBeDefined();
    expect(tool?.description.toLowerCase()).toContain('monitor');
  });

  it('queries /routes/gateway/status', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        items: [
          {
            name: 'WAN_GW',
            status: 'online',
            loss: '0.0%',
            delay: '12.345ms',
            stddev: '0.567ms',
            monitor: '1.1.1.1',
            monitor_disable: '1',
          },
        ],
        status: 'ok',
      }),
    });

    const result = await handleRoutingTool('opnsense_route_gateway_status', {}, client);
    expect(client.get).toHaveBeenCalledWith('/routes/gateway/status');
    expect(result.content[0].text).toContain('WAN_GW');
    expect(result.content[0].text).toContain('monitor_disable');
  });

  it('handles API errors gracefully', async () => {
    const client = mockClient({
      get: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });
    const result = await handleRoutingTool('opnsense_route_gateway_status', {}, client);
    expect(result.content[0].text).toContain('Error');
    expect(result.content[0].text).toContain('Connection refused');
  });
});
