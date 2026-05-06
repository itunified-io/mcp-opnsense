import { describe, it, expect, vi } from 'vitest';
import { diagnosticsToolDefinitions, handleDiagnosticsTool } from '../../src/tools/diagnostics.js';
import type { OPNsenseClient } from '../../src/client/opnsense-client.js';

function mockClient(overrides: Partial<OPNsenseClient> = {}): OPNsenseClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ status: 'ok' }),
    delete: vi.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  } as unknown as OPNsenseClient;
}

describe('Diagnostics log tool definitions', () => {
  it('exposes the 4 log tools', () => {
    const names = diagnosticsToolDefinitions.map((t) => t.name);
    expect(names).toContain('opnsense_diag_log_system');
    expect(names).toContain('opnsense_diag_log_gateways');
    expect(names).toContain('opnsense_diag_log_routing');
    expect(names).toContain('opnsense_diag_log_resolver');
  });
});

describe('handleDiagnosticsTool — log endpoints (#132 fallback chain)', () => {
  it('uses canonical GET /diagnostics/log/<category>?limit=N when it returns rows', async () => {
    const get = vi.fn().mockResolvedValue([{ severity: 'info', msg: 'boot' }]);
    const post = vi.fn();
    const client = mockClient({ get, post });

    const result = await handleDiagnosticsTool('opnsense_diag_log_system', {}, client);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/diagnostics/log/system?limit=500');
    expect(post).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('boot');
  });

  it('falls back to POST /diagnostics/log/<category>/search when canonical GET returns empty array', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce([]) // canonical → empty
      .mockResolvedValueOnce([{ severity: 'warning', msg: 'fallback hit' }]); // legacy core/ → unused
    const post = vi.fn().mockResolvedValueOnce({
      rows: [{ severity: 'warning', msg: 'WAN_GW down' }],
      total: 1,
    });
    const client = mockClient({ get, post });

    const result = await handleDiagnosticsTool('opnsense_diag_log_gateways', { limit: 100 }, client);

    expect(get).toHaveBeenNthCalledWith(1, '/diagnostics/log/gateways?limit=100');
    expect(post).toHaveBeenCalledWith('/diagnostics/log/gateways/search', {
      current: 1,
      rowCount: 100,
      sort: {},
      searchPhrase: '',
    });
    expect(result.content[0].text).toContain('WAN_GW down');
  });

  it('falls back to legacy GET /diagnostics/log/core/<category> when both newer paths return empty', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce([]) // canonical
      .mockResolvedValueOnce([{ severity: 'info', msg: 'legacy hit' }]); // legacy core/
    const post = vi.fn().mockResolvedValueOnce([]); // search empty
    const client = mockClient({ get, post });

    const result = await handleDiagnosticsTool('opnsense_diag_log_routing', { limit: 250 }, client);

    expect(get).toHaveBeenNthCalledWith(1, '/diagnostics/log/routing?limit=250');
    expect(post).toHaveBeenNthCalledWith(1, '/diagnostics/log/routing/search', expect.any(Object));
    expect(get).toHaveBeenNthCalledWith(2, '/diagnostics/log/core/routing?limit=250');
    expect(result.content[0].text).toContain('legacy hit');
  });

  it('returns last attempt payload when ALL variants return empty (genuinely-empty log)', async () => {
    const get = vi.fn().mockResolvedValue([]);
    const post = vi.fn().mockResolvedValue([]);
    const client = mockClient({ get, post });

    const result = await handleDiagnosticsTool('opnsense_diag_log_resolver', { limit: 50 }, client);

    // All 3 variants attempted: canonical GET, search POST, legacy GET
    expect(get).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(1);
    // Result is the empty array (correctly shaped, distinguishable from error)
    expect(result.content[0].text).toBe('[]');
  });

  it('skips a variant on 404 and continues to the next', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error('404 Not Found'))
      .mockResolvedValueOnce([{ severity: 'info', msg: 'recovered' }]); // legacy
    const post = vi.fn().mockRejectedValueOnce(new Error('404 Not Found'));
    const client = mockClient({ get, post });

    const result = await handleDiagnosticsTool('opnsense_diag_log_system', {}, client);
    expect(result.content[0].text).toContain('recovered');
  });

  it('propagates the last error if every variant errors', async () => {
    const get = vi.fn().mockRejectedValue(new Error('500 Internal Server Error'));
    const post = vi.fn().mockRejectedValue(new Error('500 Internal Server Error'));
    const client = mockClient({ get, post });

    const result = await handleDiagnosticsTool('opnsense_diag_log_system', {}, client);
    expect(result.content[0].text).toContain('Error');
    expect(result.content[0].text).toContain('500');
  });

  it('treats {rows: []} as empty (no fallback should ever produce a false positive on it)', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], total: 0 }) // canonical → still empty per isNonEmptyLogPayload
      .mockResolvedValueOnce({ rows: [{ msg: 'recovered from legacy' }], total: 1 }); // legacy
    const post = vi.fn().mockResolvedValueOnce({ rows: [], total: 0 });
    const client = mockClient({ get, post });

    const result = await handleDiagnosticsTool('opnsense_diag_log_system', {}, client);
    expect(result.content[0].text).toContain('recovered from legacy');
  });

  it('rejects limit out of range', async () => {
    const client = mockClient();
    const result = await handleDiagnosticsTool('opnsense_diag_log_system', { limit: 99999 }, client);
    expect(result.content[0].text).toContain('Error');
    expect(client.get).not.toHaveBeenCalled();
  });

  it('rejects limit below 1', async () => {
    const client = mockClient();
    const result = await handleDiagnosticsTool('opnsense_diag_log_gateways', { limit: 0 }, client);
    expect(result.content[0].text).toContain('Error');
    expect(client.get).not.toHaveBeenCalled();
  });

  it('coerces string limit to number (MCP transport sends numbers as strings)', async () => {
    const get = vi.fn().mockResolvedValueOnce([{ msg: 'first variant hit' }]);
    const client = mockClient({ get });
    await handleDiagnosticsTool(
      'opnsense_diag_log_gateways',
      { limit: '100' as unknown as number },
      client,
    );
    expect(get).toHaveBeenCalledWith('/diagnostics/log/gateways?limit=100');
  });
});
