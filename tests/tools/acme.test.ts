import { describe, it, expect, vi } from 'vitest';
import { acmeToolDefinitions, handleAcmeTool } from '../../src/tools/acme.js';
import type { OPNsenseClient } from '../../src/client/opnsense-client.js';

function mockClient(overrides: Partial<OPNsenseClient> = {}): OPNsenseClient {
  return {
    get: vi.fn().mockResolvedValue({ rows: [] }),
    post: vi.fn().mockResolvedValue({ uuid: 'test-uuid' }),
    delete: vi.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  } as unknown as OPNsenseClient;
}

describe('ACME Tool Definitions', () => {
  it('exports 9 tool definitions', () => {
    expect(acmeToolDefinitions).toHaveLength(9);
  });

  it('all tools have opnsense_acme_ prefix', () => {
    for (const tool of acmeToolDefinitions) {
      expect(tool.name).toMatch(/^opnsense_acme_/);
    }
  });

  it('all tools have descriptions', () => {
    for (const tool of acmeToolDefinitions) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it('all tools have inputSchema', () => {
    for (const tool of acmeToolDefinitions) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

describe('handleAcmeTool', () => {
  it('lists accounts', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ rows: [{ name: 'LE', email: 'test@test.com' }] }),
    });

    const result = await handleAcmeTool('opnsense_acme_list_accounts', {}, client);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('LE');
    expect(client.get).toHaveBeenCalledWith('/acme/accounts/search');
  });

  it('lists challenges', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ rows: [{ name: 'CF DNS', dns_service: 'dns_cf' }] }),
    });

    const result = await handleAcmeTool('opnsense_acme_list_challenges', {}, client);
    expect(result.content[0].text).toContain('dns_cf');
    expect(client.get).toHaveBeenCalledWith('/acme/validations/search');
  });

  it('adds a challenge with valid params', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ uuid: 'challenge-uuid' }),
    });

    const result = await handleAcmeTool('opnsense_acme_add_challenge', {
      name: 'Cloudflare DNS-01',
      dns_service: 'dns_cf',
      dns_environment: 'CF_Token=xxx CF_Account_ID=yyy',
    }, client);

    expect(result.content[0].text).toContain('challenge-uuid');
    expect(client.post).toHaveBeenCalledWith('/acme/validations/add', expect.objectContaining({
      validation: expect.objectContaining({ dns_service: 'dns_cf' }),
    }));
  });

  it('rejects invalid dns_service', async () => {
    const client = mockClient();
    const result = await handleAcmeTool('opnsense_acme_add_challenge', {
      name: 'Bad Provider',
      dns_service: 'dns_invalid',
    }, client);

    expect(result.content[0].text).toContain('Error');
  });

  it('deletes a challenge by UUID', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ result: 'deleted' }),
    });

    const result = await handleAcmeTool('opnsense_acme_delete_challenge', {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
    }, client);

    expect(result.content[0].type).toBe('text');
    expect(client.post).toHaveBeenCalledWith('/acme/validations/del/550e8400-e29b-41d4-a716-446655440000');
  });

  it('lists certificates', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ rows: [{ name: 'bifrost.itunified.io', statusCode: '200' }] }),
    });

    const result = await handleAcmeTool('opnsense_acme_list_certs', {}, client);
    expect(result.content[0].text).toContain('bifrost');
    expect(client.get).toHaveBeenCalledWith('/acme/certificates/search');
  });

  it('creates a certificate with valid params', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ uuid: 'cert-uuid' }),
    });

    const result = await handleAcmeTool('opnsense_acme_create_cert', {
      name: 'bifrost.itunified.io',
      alt_names: 'bifrost.itunified.io,*.itunified.io',
      account_uuid: '550e8400-e29b-41d4-a716-446655440000',
      validation_uuid: '660e8400-e29b-41d4-a716-446655440000',
    }, client);

    expect(result.content[0].text).toContain('cert-uuid');
    expect(client.post).toHaveBeenCalledWith('/acme/certificates/add', expect.objectContaining({
      certificate: expect.objectContaining({
        name: 'bifrost.itunified.io',
        keyLength: 'ec256',
        autoRenewal: '1',
      }),
    }));
  });

  it('deletes a certificate by UUID', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ result: 'deleted' }),
    });

    const result = await handleAcmeTool('opnsense_acme_delete_cert', {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
    }, client);

    expect(result.content[0].type).toBe('text');
    expect(client.post).toHaveBeenCalledWith('/acme/certificates/del/550e8400-e29b-41d4-a716-446655440000');
  });

  it('renews a certificate', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const result = await handleAcmeTool('opnsense_acme_renew_cert', {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
    }, client);

    expect(result.content[0].text).toContain('ok');
    expect(client.post).toHaveBeenCalledWith('/acme/certificates/sign/550e8400-e29b-41d4-a716-446655440000');
  });

  it('applies ACME changes', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const result = await handleAcmeTool('opnsense_acme_apply', {}, client);
    expect(result.content[0].text).toContain('ok');
    expect(client.post).toHaveBeenCalledWith('/acme/service/reconfigure');
  });

  it('returns error for unknown tool', async () => {
    const client = mockClient();
    const result = await handleAcmeTool('opnsense_acme_nonexistent', {}, client);
    expect(result.content[0].text).toContain('Unknown');
  });

  it('handles API errors gracefully', async () => {
    const client = mockClient({
      get: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });

    const result = await handleAcmeTool('opnsense_acme_list_accounts', {}, client);
    expect(result.content[0].text).toContain('Error');
  });
});
