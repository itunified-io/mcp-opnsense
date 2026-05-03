import { describe, it, expect, vi } from 'vitest';
import { natToolDefinitions, handleNatTool } from '../../src/tools/nat.js';
import type { OPNsenseClient } from '../../src/client/opnsense-client.js';

function mockClient(overrides: Partial<OPNsenseClient> = {}): OPNsenseClient {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({ result: 'saved' }),
    delete: vi.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  } as unknown as OPNsenseClient;
}

describe('NAT tool definitions', () => {
  it('exports 7 SNAT tools', () => {
    expect(natToolDefinitions).toHaveLength(7);
  });
  it('all start with opnsense_nat_', () => {
    for (const t of natToolDefinitions) expect(t.name).toMatch(/^opnsense_nat_/);
  });
});

describe('handleNatTool', () => {
  it('lists source NAT rules', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    });
    const r = await handleNatTool('opnsense_nat_source_list', {}, client);
    expect(client.get).toHaveBeenCalledWith('/firewall/source_nat/search_rule');
    expect(r.content[0].text).toContain('total');
  });

  it('gets a single source NAT rule', async () => {
    const client = mockClient({ get: vi.fn().mockResolvedValue({ rule: { enabled: '1' } }) });
    await handleNatTool(
      'opnsense_nat_source_get',
      { uuid: '0695b31d-3fe9-47ea-8473-81779edddf34' },
      client,
    );
    expect(client.get).toHaveBeenCalledWith(
      '/firewall/source_nat/get_rule/0695b31d-3fe9-47ea-8473-81779edddf34',
    );
  });

  it('adds a SNAT rule with confirm', async () => {
    const post = vi.fn().mockResolvedValue({ result: 'saved', uuid: 'new-uuid' });
    const client = mockClient({ post } as Partial<OPNsenseClient>);
    await handleNatTool(
      'opnsense_nat_source_add',
      {
        interface: 'wan',
        target: 'wanip',
        source_net: '10.10.0.0/24',
        confirm: true,
      },
      client,
    );
    expect(post).toHaveBeenCalledWith('/firewall/source_nat/add_rule', expect.any(Object));
    const [, body] = post.mock.calls[0] as [string, { rule: Record<string, unknown> }];
    expect(body.rule.interface).toBe('wan');
    expect(body.rule.target).toBe('wanip');
    expect(body.rule.source_net).toBe('10.10.0.0/24');
    expect(body.rule.enabled).toBe('1');
  });

  it('rejects add without confirm', async () => {
    const client = mockClient();
    const r = await handleNatTool(
      'opnsense_nat_source_add',
      { interface: 'wan' },
      client,
    );
    expect(r.content[0].text).toContain('Error');
  });

  it('coerces string "true" on confirm (MCP transport)', async () => {
    const post = vi.fn().mockResolvedValue({ result: 'saved' });
    const client = mockClient({ post } as Partial<OPNsenseClient>);
    const r = await handleNatTool(
      'opnsense_nat_source_add',
      { interface: 'wan', confirm: 'true' as unknown as true },
      client,
    );
    expect(r.content[0].text).toContain('saved');
  });

  it('updates a SNAT rule by round-tripping current config', async () => {
    const get = vi.fn().mockResolvedValue({
      rule: {
        enabled: '1',
        interface: { wan: { value: 'WAN', selected: 1 }, lan: { value: 'LAN', selected: 0 } },
        ipprotocol: { inet: { value: 'IPv4', selected: 1 }, inet6: { value: 'IPv6', selected: 0 } },
        source_net: 'any',
        destination_net: '10.0.0.0/8',
        target: 'wanip',
        sequence: '100',
      },
    });
    const post = vi.fn().mockResolvedValue({ result: 'saved' });
    const client = mockClient({ get, post } as Partial<OPNsenseClient>);

    await handleNatTool(
      'opnsense_nat_source_update',
      {
        uuid: '0695b31d-3fe9-47ea-8473-81779edddf34',
        description: 'updated by mcp',
        confirm: true,
      },
      client,
    );

    const [, body] = post.mock.calls[0] as [string, { rule: Record<string, string> }];
    expect(body.rule.description).toBe('updated by mcp');
    // preserved values
    expect(body.rule.interface).toBe('wan');
    expect(body.rule.ipprotocol).toBe('inet');
    expect(body.rule.destination_net).toBe('10.0.0.0/8');
    expect(body.rule.target).toBe('wanip');
  });

  it('deletes a SNAT rule', async () => {
    const post = vi.fn().mockResolvedValue({ result: 'deleted' });
    const client = mockClient({ post } as Partial<OPNsenseClient>);
    await handleNatTool(
      'opnsense_nat_source_delete',
      { uuid: '0695b31d-3fe9-47ea-8473-81779edddf34', confirm: true },
      client,
    );
    expect(post).toHaveBeenCalledWith(
      '/firewall/source_nat/del_rule/0695b31d-3fe9-47ea-8473-81779edddf34',
    );
  });

  it('toggles a SNAT rule', async () => {
    const post = vi.fn().mockResolvedValue({ result: 'toggled' });
    const client = mockClient({ post } as Partial<OPNsenseClient>);
    await handleNatTool(
      'opnsense_nat_source_toggle',
      { uuid: '0695b31d-3fe9-47ea-8473-81779edddf34', confirm: true },
      client,
    );
    expect(post).toHaveBeenCalledWith(
      '/firewall/source_nat/toggle_rule/0695b31d-3fe9-47ea-8473-81779edddf34',
    );
  });

  it('applies pending NAT changes', async () => {
    const post = vi.fn().mockResolvedValue({ status: 'ok' });
    const client = mockClient({ post } as Partial<OPNsenseClient>);
    await handleNatTool('opnsense_nat_apply', { confirm: true }, client);
    expect(post).toHaveBeenCalledWith('/firewall/source_nat/apply', {});
  });

  it('rejects apply without confirm', async () => {
    const client = mockClient();
    const r = await handleNatTool('opnsense_nat_apply', {}, client);
    expect(r.content[0].text).toContain('Error');
  });
});
