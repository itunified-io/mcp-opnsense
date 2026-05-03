import { describe, it, expect, vi } from 'vitest';
import { dnsToolDefinitions, handleDnsTool } from '../../src/tools/dns.js';
import type { OPNsenseClient } from '../../src/client/opnsense-client.js';

function mockClient(overrides: Partial<OPNsenseClient> = {}): OPNsenseClient {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({ result: 'saved' }),
    delete: vi.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  } as unknown as OPNsenseClient;
}

const SAMPLE_DNSBL = {
  blocklist: {
    enabled: '1',
    type: {
      atf: { value: 'Abuse.ch ThreatFox', selected: 0 },
      ag: { value: 'AdGuard', selected: 1 },
      hgz002: { value: 'hagezi NORMAL', selected: 1 },
      sb: { value: 'Steven Black', selected: 0 },
    },
    lists: '',
    nxdomain: '0',
  },
};

describe('Unbound DNSBL tool definitions', () => {
  it('exposes the 3 new blocklist tools', () => {
    const names = dnsToolDefinitions.map((t) => t.name);
    expect(names).toContain('opnsense_dns_blocklist_get');
    expect(names).toContain('opnsense_dns_blocklist_sources_list');
    expect(names).toContain('opnsense_dns_blocklist_set');
  });
});

describe('handleDnsTool — DNSBL', () => {
  it('gets the raw blocklist config', async () => {
    const client = mockClient({ get: vi.fn().mockResolvedValue(SAMPLE_DNSBL) });
    const r = await handleDnsTool('opnsense_dns_blocklist_get', {}, client);
    expect(client.get).toHaveBeenCalledWith('/unbound/settings/getDnsbl');
    expect(r.content[0].text).toContain('hgz002');
  });

  it('lists available sources with selected state', async () => {
    const client = mockClient({ get: vi.fn().mockResolvedValue(SAMPLE_DNSBL) });
    const r = await handleDnsTool('opnsense_dns_blocklist_sources_list', {}, client);
    const out = JSON.parse(r.content[0].text);
    expect(out.total).toBe(4);
    const ag = out.sources.find((s: { id: string }) => s.id === 'ag');
    expect(ag).toEqual({ id: 'ag', name: 'AdGuard', selected: true });
    const atf = out.sources.find((s: { id: string }) => s.id === 'atf');
    expect(atf.selected).toBe(false);
  });

  it('sets blocklist enabling new sources, preserving existing fields', async () => {
    const get = vi.fn().mockResolvedValue(SAMPLE_DNSBL);
    const post = vi.fn().mockResolvedValue({ result: 'saved' });
    const client = mockClient({ get, post } as Partial<OPNsenseClient>);

    await handleDnsTool(
      'opnsense_dns_blocklist_set',
      { sources: ['ag', 'hgz002', 'sb'], enabled: true, confirm: true },
      client,
    );

    expect(post).toHaveBeenCalledWith('/unbound/settings/setDnsbl', expect.any(Object));
    const [, body] = post.mock.calls[0] as [string, { blocklist: Record<string, unknown> }];
    expect(body.blocklist.enabled).toBe('1');
    expect(body.blocklist.type).toBe('ag,hgz002,sb');
    expect(body.blocklist.nxdomain).toBe('0'); // preserved
  });

  it('rejects set without confirm', async () => {
    const client = mockClient();
    const r = await handleDnsTool(
      'opnsense_dns_blocklist_set',
      { sources: ['ag'] },
      client,
    );
    expect(r.content[0].text).toContain('Error');
  });

  it('coerces string "true" on confirm (MCP transport)', async () => {
    const get = vi.fn().mockResolvedValue(SAMPLE_DNSBL);
    const post = vi.fn().mockResolvedValue({ result: 'saved' });
    const client = mockClient({ get, post } as Partial<OPNsenseClient>);
    const r = await handleDnsTool(
      'opnsense_dns_blocklist_set',
      { confirm: 'true' as unknown as true },
      client,
    );
    expect(r.content[0].text).toContain('saved');
  });

  it('preserves currently-selected sources when sources arg omitted', async () => {
    const get = vi.fn().mockResolvedValue(SAMPLE_DNSBL);
    const post = vi.fn().mockResolvedValue({ result: 'saved' });
    const client = mockClient({ get, post } as Partial<OPNsenseClient>);
    await handleDnsTool(
      'opnsense_dns_blocklist_set',
      { nxdomain: true, confirm: true },
      client,
    );
    const [, body] = post.mock.calls[0] as [string, { blocklist: Record<string, string> }];
    // Only ag + hgz002 were selected in SAMPLE_DNSBL
    expect(body.blocklist.type).toBe('ag,hgz002');
    expect(body.blocklist.nxdomain).toBe('1');
  });
});
