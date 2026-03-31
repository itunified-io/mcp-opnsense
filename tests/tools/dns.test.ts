import { describe, it, expect, vi } from 'vitest';
import { dnsToolDefinitions, handleDnsTool } from '../../src/tools/dns.js';
import type { OPNsenseClient } from '../../src/client/opnsense-client.js';

function mockClient(overrides: Partial<OPNsenseClient> = {}): OPNsenseClient {
  return {
    get: vi.fn().mockResolvedValue({ rows: [] }),
    post: vi.fn().mockResolvedValue({ uuid: 'test-uuid' }),
    delete: vi.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  } as unknown as OPNsenseClient;
}

describe('DNS Tool Definitions', () => {
  it('exports 16 tool definitions', () => {
    expect(dnsToolDefinitions).toHaveLength(16);
  });

  it('all tools have opnsense_dns_ prefix', () => {
    for (const tool of dnsToolDefinitions) {
      expect(tool.name).toMatch(/^opnsense_dns_/);
    }
  });

  it('all tools have descriptions', () => {
    for (const tool of dnsToolDefinitions) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it('all tools have inputSchema', () => {
    for (const tool of dnsToolDefinitions) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

describe('handleDnsTool', () => {
  it('lists overrides', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ rows: [{ hostname: 'test', domain: 'local' }] }),
    });

    const result = await handleDnsTool('opnsense_dns_list_overrides', {}, client);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('test');
    expect(client.get).toHaveBeenCalled();
  });

  it('adds an override with valid params', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ uuid: 'new-uuid' }),
    });

    const result = await handleDnsTool('opnsense_dns_add_override', {
      hostname: 'myhost',
      domain: 'local.lan',
      server: '10.10.0.50',
    }, client);

    expect(result.content[0].text).toContain('new-uuid');
    expect(client.post).toHaveBeenCalled();
  });

  it('deletes an override by UUID', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ result: 'deleted' }),
    });

    const result = await handleDnsTool('opnsense_dns_delete_override', {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
    }, client);

    expect(result.content[0].type).toBe('text');
  });

  it('applies DNS changes', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const result = await handleDnsTool('opnsense_dns_apply', {}, client);
    expect(result.content[0].text).toContain('ok');
  });

  it('returns error for unknown tool', async () => {
    const client = mockClient();
    const result = await handleDnsTool('opnsense_dns_nonexistent', {}, client);
    expect(result.content[0].text).toContain('Unknown');
  });

  it('flushes zone by flushing cache and restarting Unbound', async () => {
    const postMock = vi.fn().mockResolvedValue({ status: 'ok' });
    const client = mockClient({ post: postMock });

    const result = await handleDnsTool('opnsense_dns_flush_zone', {
      domain: 'example.com',
    }, client);

    expect(result.content[0].text).toContain('example.com');
    expect(result.content[0].text).toContain('Flushed');
    expect(postMock).toHaveBeenCalledTimes(2);
  });

  it('searches DNS cache for domain entries', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue('example.com. IN A 93.184.216.34\nother.net. IN A 1.2.3.4\nsub.example.com. IN AAAA ::1'),
    });

    const result = await handleDnsTool('opnsense_dns_cache_search', {
      domain: 'example.com',
    }, client);

    expect(result.content[0].text).toContain('2 found');
    expect(result.content[0].text).toContain('example.com');
    expect(result.content[0].text).not.toContain('other.net');
  });

  it('returns empty message when no cache entries match', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue('other.net. IN A 1.2.3.4'),
    });

    const result = await handleDnsTool('opnsense_dns_cache_search', {
      domain: 'example.com',
    }, client);

    expect(result.content[0].text).toContain('No cache entries found');
  });

  it('gets DNS stats', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ total: { num: { queries: 1000 } } }),
    });

    const result = await handleDnsTool('opnsense_dns_stats', {}, client);
    expect(result.content[0].text).toContain('1000');
  });

  it('dumps infrastructure cache', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ infra: 'data' }),
    });

    const result = await handleDnsTool('opnsense_dns_infra', {}, client);
    expect(result.content[0].text).toContain('infra');
  });

  it('handles API errors gracefully', async () => {
    const client = mockClient({
      get: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });

    const result = await handleDnsTool('opnsense_dns_list_overrides', {}, client);
    expect(result.content[0].text).toContain('Error');
  });
});
