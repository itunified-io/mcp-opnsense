import { describe, it, expect, vi } from 'vitest';
import { dhcpToolDefinitions, handleDhcpTool } from '../../src/tools/dhcp.js';
import type { OPNsenseClient } from '../../src/client/opnsense-client.js';

function mockClient(overrides: Partial<OPNsenseClient> = {}): OPNsenseClient {
  return {
    get: vi.fn().mockResolvedValue({ rows: [] }),
    post: vi.fn().mockResolvedValue({ status: 'ok' }),
    delete: vi.fn().mockResolvedValue({ status: 'ok' }),
    getRaw: vi.fn().mockResolvedValue(''),
    ...overrides,
  } as unknown as OPNsenseClient;
}

describe('DHCP Tool Definitions', () => {
  it('exports tool definitions', () => {
    expect(dhcpToolDefinitions.length).toBeGreaterThanOrEqual(11);
  });

  it('all tools have opnsense_ prefix', () => {
    for (const tool of dhcpToolDefinitions) {
      expect(tool.name).toMatch(/^opnsense_/);
    }
  });

  it('lease tool descriptions mention Kea fallback', () => {
    const list = dhcpToolDefinitions.find((t) => t.name === 'opnsense_dhcp_list_leases');
    const find = dhcpToolDefinitions.find((t) => t.name === 'opnsense_dhcp_find_lease');
    expect(list?.description).toMatch(/Kea/);
    expect(find?.description).toMatch(/Kea/);
  });
});

describe('handleDhcpTool — list_leases (#131)', () => {
  it('returns Kea leases when the Kea endpoint succeeds', async () => {
    const keaRows = [
      { address: '10.0.0.100', hwaddr: 'aa:bb:cc:dd:ee:ff', state: 'active' },
      { address: '10.0.0.101', hwaddr: 'aa:bb:cc:dd:ee:00', state: 'active' },
    ];
    const get = vi.fn(async (path: string) => {
      if (path === '/kea/leases4/search') return { rows: keaRows, total: 2 };
      throw new Error(`unexpected path: ${path}`);
    });
    const client = mockClient({ get });

    const result = await handleDhcpTool('opnsense_dhcp_list_leases', {}, client);
    expect(result.content[0].text).toContain('10.0.0.100');
    expect(result.content[0].text).toContain('aa:bb:cc:dd:ee:ff');
    expect(get).toHaveBeenCalledWith('/kea/leases4/search');
  });

  it('falls back to ISC when Kea endpoint throws (plugin not installed)', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error('GET /kea/leases4/search: 404 Not Found'))
      .mockResolvedValueOnce({ rows: [{ address: '192.168.1.50', mac: 'bb:cc:dd:ee:ff:00' }] });
    const client = mockClient({ get });

    const result = await handleDhcpTool('opnsense_dhcp_list_leases', {}, client);
    expect(result.content[0].text).toContain('192.168.1.50');
    expect(get).toHaveBeenNthCalledWith(1, '/kea/leases4/search');
    expect(get).toHaveBeenNthCalledWith(2, '/dhcpv4/leases/searchLease');
  });

  it('returns Kea result even when rows are empty (no fallback)', async () => {
    // Important: empty rows is a valid Kea response (no leases yet) and
    // MUST NOT trigger the ISC fallback. Only an actual error should.
    const get = vi.fn().mockResolvedValueOnce({ rows: [], total: 0 });
    const client = mockClient({ get });

    const result = await handleDhcpTool('opnsense_dhcp_list_leases', {}, client);
    expect(result.content[0].text).toContain('"total": 0');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/kea/leases4/search');
  });
});

describe('handleDhcpTool — find_lease (#131)', () => {
  it('searches Kea by query and forwards searchPhrase', async () => {
    const get = vi.fn().mockResolvedValueOnce({
      rows: [{ address: '10.0.0.100', hwaddr: 'aa:bb:cc:dd:ee:ff' }],
    });
    const client = mockClient({ get });

    const result = await handleDhcpTool(
      'opnsense_dhcp_find_lease',
      { query: 'aa:bb:cc:dd:ee:ff' },
      client,
    );
    expect(result.content[0].text).toContain('10.0.0.100');
    expect(get).toHaveBeenCalledWith(
      '/kea/leases4/search?searchPhrase=aa%3Abb%3Acc%3Add%3Aee%3Aff',
    );
  });

  it('falls back to ISC searchLease when Kea search throws', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error('Kea not available'))
      .mockResolvedValueOnce({ rows: [{ address: '192.168.1.50' }] });
    const client = mockClient({ get });

    const result = await handleDhcpTool(
      'opnsense_dhcp_find_lease',
      { query: '192.168.1.50' },
      client,
    );
    expect(result.content[0].text).toContain('192.168.1.50');
    expect(get).toHaveBeenNthCalledWith(2, '/dhcpv4/leases/searchLease?searchPhrase=192.168.1.50');
  });

  it('rejects empty query', async () => {
    const client = mockClient();
    const result = await handleDhcpTool('opnsense_dhcp_find_lease', { query: '' }, client);
    expect(result.content[0].text).toContain('Error');
  });
});
