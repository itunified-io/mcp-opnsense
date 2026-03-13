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
  it('exports 14 tool definitions', () => {
    expect(acmeToolDefinitions).toHaveLength(14);
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
    expect(client.get).toHaveBeenCalledWith('/acmeclient/accounts/search');
  });

  it('lists challenges', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ rows: [{ name: 'CF DNS', dns_service: 'dns_cf' }] }),
    });

    const result = await handleAcmeTool('opnsense_acme_list_challenges', {}, client);
    expect(result.content[0].text).toContain('dns_cf');
    expect(client.get).toHaveBeenCalledWith('/acmeclient/validations/search');
  });

  it('adds a challenge with Cloudflare credential fields', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ uuid: 'challenge-uuid' }),
    });

    const result = await handleAcmeTool('opnsense_acme_add_challenge', {
      name: 'Cloudflare DNS-01',
      dns_service: 'dns_cf',
      dns_cf_token: 'my-cf-token',
      dns_cf_account_id: 'my-account-id',
    }, client);

    expect(result.content[0].text).toContain('challenge-uuid');
    expect(client.post).toHaveBeenCalledWith('/acmeclient/validations/add', expect.objectContaining({
      validation: expect.objectContaining({
        dns_service: 'dns_cf',
        dns_cf_token: 'my-cf-token',
        dns_cf_account_id: 'my-account-id',
      }),
    }));
  });

  it('adds a challenge without provider fields (backward compat)', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ uuid: 'challenge-uuid' }),
    });

    const result = await handleAcmeTool('opnsense_acme_add_challenge', {
      name: 'AWS DNS',
      dns_service: 'dns_aws',
      dns_environment: 'AWS_ACCESS_KEY_ID=xxx AWS_SECRET_ACCESS_KEY=yyy',
    }, client);

    expect(result.content[0].text).toContain('challenge-uuid');
    expect(client.post).toHaveBeenCalledWith('/acmeclient/validations/add', expect.objectContaining({
      validation: expect.objectContaining({
        dns_service: 'dns_aws',
        dns_environment: 'AWS_ACCESS_KEY_ID=xxx AWS_SECRET_ACCESS_KEY=yyy',
      }),
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

  it('updates a challenge using /update/ endpoint (not /set/)', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ result: 'saved' }),
    });

    const result = await handleAcmeTool('opnsense_acme_update_challenge', {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      dns_cf_token: 'new-token',
      dns_cf_account_id: 'new-account-id',
    }, client);

    expect(result.content[0].text).toContain('saved');
    // CRITICAL: must use /update/ not /set/ (#25)
    expect(client.post).toHaveBeenCalledWith(
      '/acmeclient/validations/update/550e8400-e29b-41d4-a716-446655440000',
      expect.objectContaining({
        validation: expect.objectContaining({
          dns_cf_token: 'new-token',
          dns_cf_account_id: 'new-account-id',
        }),
      }),
    );
  });

  it('deletes a challenge by UUID', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ result: 'deleted' }),
    });

    const result = await handleAcmeTool('opnsense_acme_delete_challenge', {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
    }, client);

    expect(result.content[0].type).toBe('text');
    expect(client.post).toHaveBeenCalledWith('/acmeclient/validations/del/550e8400-e29b-41d4-a716-446655440000');
  });

  it('lists certificates', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ rows: [{ name: 'fw.example.com', statusCode: '200' }] }),
    });

    const result = await handleAcmeTool('opnsense_acme_list_certs', {}, client);
    expect(result.content[0].text).toContain('fw.example.com');
    expect(client.get).toHaveBeenCalledWith('/acmeclient/certificates/search');
  });

  it('creates a certificate with correct keyLength mapping (#23)', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ uuid: 'cert-uuid' }),
    });

    const result = await handleAcmeTool('opnsense_acme_create_cert', {
      name: 'fw.example.com',
      alt_names: 'fw.example.com,*.example.com',
      account_uuid: '550e8400-e29b-41d4-a716-446655440000',
      validation_uuid: '660e8400-e29b-41d4-a716-446655440000',
    }, client);

    expect(result.content[0].text).toContain('cert-uuid');
    expect(client.post).toHaveBeenCalledWith('/acmeclient/certificates/add', expect.objectContaining({
      certificate: expect.objectContaining({
        name: 'fw.example.com',
        keyLength: 'key_ec256', // mapped from ec256 → key_ec256
        autoRenewal: '1',
      }),
    }));
  });

  it('maps ec384 to key_ec384', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ uuid: 'cert-uuid' }),
    });

    await handleAcmeTool('opnsense_acme_create_cert', {
      name: 'test.example.com',
      alt_names: 'test.example.com',
      account_uuid: '550e8400-e29b-41d4-a716-446655440000',
      validation_uuid: '660e8400-e29b-41d4-a716-446655440000',
      key_length: 'ec384',
    }, client);

    expect(client.post).toHaveBeenCalledWith('/acmeclient/certificates/add', expect.objectContaining({
      certificate: expect.objectContaining({
        keyLength: 'key_ec384',
      }),
    }));
  });

  it('passes RSA key lengths unchanged', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ uuid: 'cert-uuid' }),
    });

    await handleAcmeTool('opnsense_acme_create_cert', {
      name: 'test.example.com',
      alt_names: 'test.example.com',
      account_uuid: '550e8400-e29b-41d4-a716-446655440000',
      validation_uuid: '660e8400-e29b-41d4-a716-446655440000',
      key_length: '4096',
    }, client);

    expect(client.post).toHaveBeenCalledWith('/acmeclient/certificates/add', expect.objectContaining({
      certificate: expect.objectContaining({
        keyLength: '4096',
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
    expect(client.post).toHaveBeenCalledWith('/acmeclient/certificates/del/550e8400-e29b-41d4-a716-446655440000');
  });

  it('renews a certificate', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const result = await handleAcmeTool('opnsense_acme_renew_cert', {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
    }, client);

    expect(result.content[0].text).toContain('ok');
    expect(client.post).toHaveBeenCalledWith('/acmeclient/certificates/sign/550e8400-e29b-41d4-a716-446655440000');
  });

  it('applies ACME changes', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const result = await handleAcmeTool('opnsense_acme_apply', {}, client);
    expect(result.content[0].text).toContain('ok');
    expect(client.post).toHaveBeenCalledWith('/acmeclient/service/reconfigure');
  });

  it('adds an ACME account with valid params', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ uuid: 'account-uuid' }),
    });

    const result = await handleAcmeTool('opnsense_acme_add_account', {
      name: "Let's Encrypt Production",
      email: 'admin@example.com',
    }, client);

    expect(result.content[0].text).toContain('account-uuid');
    expect(client.post).toHaveBeenCalledWith('/acmeclient/accounts/add', expect.objectContaining({
      account: expect.objectContaining({
        email: 'admin@example.com',
        ca: 'letsencrypt',
      }),
    }));
  });

  it('adds an ACME account with custom CA', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ uuid: 'staging-uuid' }),
    });

    const result = await handleAcmeTool('opnsense_acme_add_account', {
      name: 'LE Staging',
      email: 'test@example.com',
      ca: 'letsencrypt-staging',
    }, client);

    expect(result.content[0].text).toContain('staging-uuid');
    expect(client.post).toHaveBeenCalledWith('/acmeclient/accounts/add', expect.objectContaining({
      account: expect.objectContaining({ ca: 'letsencrypt-staging' }),
    }));
  });

  it('rejects add account with invalid email', async () => {
    const client = mockClient();
    const result = await handleAcmeTool('opnsense_acme_add_account', {
      name: 'Bad Account',
      email: 'not-an-email',
    }, client);

    expect(result.content[0].text).toContain('Error');
  });

  it('deletes an ACME account by UUID', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ result: 'deleted' }),
    });

    const result = await handleAcmeTool('opnsense_acme_delete_account', {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
    }, client);

    expect(result.content[0].type).toBe('text');
    expect(client.post).toHaveBeenCalledWith('/acmeclient/accounts/del/550e8400-e29b-41d4-a716-446655440000');
  });

  it('registers an ACME account', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ response: 'OK' }),
    });

    const result = await handleAcmeTool('opnsense_acme_register_account', {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
    }, client);

    expect(result.content[0].text).toContain('OK');
    expect(client.post).toHaveBeenCalledWith('/acmeclient/accounts/register/550e8400-e29b-41d4-a716-446655440000');
  });

  it('gets ACME settings when no params provided', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ acmeclient: { settings: { enabled: '1', environment: 'prod' } } }),
    });

    const result = await handleAcmeTool('opnsense_acme_settings', {}, client);
    expect(result.content[0].text).toContain('prod');
    expect(client.get).toHaveBeenCalledWith('/acmeclient/settings/get');
  });

  it('updates ACME settings with acmeclient wrapper (#26)', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ result: 'saved' }),
    });

    const result = await handleAcmeTool('opnsense_acme_settings', {
      enabled: '1',
      environment: 'prod',
    }, client);

    expect(result.content[0].text).toContain('saved');
    // CRITICAL: must use acmeclient wrapper (#26)
    expect(client.post).toHaveBeenCalledWith('/acmeclient/settings/set', {
      acmeclient: {
        settings: {
          enabled: '1',
          environment: 'prod',
        },
      },
    });
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
