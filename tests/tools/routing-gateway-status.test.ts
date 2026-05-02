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

  it('exposes opnsense_route_gateway_update + _apply definitions', () => {
    const update = routingToolDefinitions.find((t) => t.name === 'opnsense_route_gateway_update');
    const apply = routingToolDefinitions.find((t) => t.name === 'opnsense_route_gateway_apply');
    expect(update).toBeDefined();
    expect(apply).toBeDefined();
  });

  it('updates a gateway by round-tripping current config', async () => {
    const get = vi.fn().mockResolvedValue({
      gateway_item: {
        name: 'WAN_GW',
        descr: 'WAN Gateway',
        interface: { wan: { value: 'WAN', selected: 1 }, lan: { value: 'LAN', selected: 0 } },
        ipprotocol: { inet: { value: 'IPv4', selected: 1 }, inet6: { value: 'IPv6', selected: 0 } },
        gateway: '',
        defaultgw: '1',
        monitor_disable: '1',
        monitor: '',
        priority: '255',
        weight: '1',
        disabled: '0',
      },
    });
    const post = vi.fn().mockResolvedValue({ status: 'ok' });
    const client = mockClient({ get, post } as Partial<OPNsenseClient>);

    await handleRoutingTool(
      'opnsense_route_gateway_update',
      {
        uuid: '983182ee-153b-47fa-bdbd-31d9fdf21602',
        monitor_disable: false,
        monitor: '1.1.1.1',
        confirm: true,
      },
      client,
    );

    expect(get).toHaveBeenCalledWith(
      '/routing/settings/getGateway/983182ee-153b-47fa-bdbd-31d9fdf21602',
    );
    const setCall = post.mock.calls.find((c) => String(c[0]).includes('setGateway')) as [string, { gateway_item: Record<string, string> }];
    expect(setCall).toBeDefined();
    expect(setCall[1].gateway_item.monitor_disable).toBe('0');
    expect(setCall[1].gateway_item.monitor).toBe('1.1.1.1');
    expect(setCall[1].gateway_item.interface).toBe('wan');
    expect(setCall[1].gateway_item.ipprotocol).toBe('inet');
    expect(setCall[1].gateway_item.priority).toBe('255'); // preserved
    expect(setCall[1].gateway_item.defaultgw).toBe('1'); // preserved
  });

  it('rejects gateway_update without confirm', async () => {
    const client = mockClient();
    const result = await handleRoutingTool(
      'opnsense_route_gateway_update',
      { uuid: '983182ee-153b-47fa-bdbd-31d9fdf21602', monitor_disable: false },
      client,
    );
    expect(result.content[0].text).toContain('Error');
  });

  it('coerces string "true" on gateway_update confirm (MCP transport)', async () => {
    const get = vi.fn().mockResolvedValue({ gateway_item: { name: 'X', interface: 'wan', ipprotocol: 'inet' } });
    const post = vi.fn().mockResolvedValue({ status: 'ok' });
    const client = mockClient({ get, post } as Partial<OPNsenseClient>);
    const result = await handleRoutingTool(
      'opnsense_route_gateway_update',
      {
        uuid: '983182ee-153b-47fa-bdbd-31d9fdf21602',
        monitor_disable: 'false' as unknown as boolean,
        confirm: 'true' as unknown as true,
      },
      client,
    );
    expect(result.content[0].text).toContain('ok');
  });

  it('applies gateway changes with confirm', async () => {
    const post = vi.fn().mockResolvedValue({ status: 'ok' });
    const client = mockClient({ post } as Partial<OPNsenseClient>);
    const result = await handleRoutingTool('opnsense_route_gateway_apply', { confirm: true }, client);
    expect(result.content[0].text).toContain('ok');
    expect(post).toHaveBeenCalledWith('/routing/settings/reconfigure', {});
  });

  it('rejects gateway_apply without confirm', async () => {
    const client = mockClient();
    const result = await handleRoutingTool('opnsense_route_gateway_apply', {}, client);
    expect(result.content[0].text).toContain('Error');
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
