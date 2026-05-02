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
  it('exposes the 4 new core log tools', () => {
    const names = diagnosticsToolDefinitions.map((t) => t.name);
    expect(names).toContain('opnsense_diag_log_system');
    expect(names).toContain('opnsense_diag_log_gateways');
    expect(names).toContain('opnsense_diag_log_routing');
    expect(names).toContain('opnsense_diag_log_resolver');
  });
});

describe('handleDiagnosticsTool — log endpoints', () => {
  it('queries system log with default limit (500)', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue([{ severity: 'info', msg: 'boot' }]),
    });
    const result = await handleDiagnosticsTool('opnsense_diag_log_system', {}, client);
    expect(client.get).toHaveBeenCalledWith('/diagnostics/log/core/system?limit=500');
    expect(result.content[0].text).toContain('boot');
  });

  it('queries gateways log with custom limit', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue([{ severity: 'warning', msg: 'WAN_GW down' }]),
    });
    const result = await handleDiagnosticsTool('opnsense_diag_log_gateways', { limit: 100 }, client);
    expect(client.get).toHaveBeenCalledWith('/diagnostics/log/core/gateways?limit=100');
    expect(result.content[0].text).toContain('WAN_GW down');
  });

  it('queries routing log', async () => {
    const client = mockClient();
    await handleDiagnosticsTool('opnsense_diag_log_routing', { limit: 250 }, client);
    expect(client.get).toHaveBeenCalledWith('/diagnostics/log/core/routing?limit=250');
  });

  it('queries resolver log', async () => {
    const client = mockClient();
    await handleDiagnosticsTool('opnsense_diag_log_resolver', { limit: 50 }, client);
    expect(client.get).toHaveBeenCalledWith('/diagnostics/log/core/resolver?limit=50');
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
    const client = mockClient();
    await handleDiagnosticsTool('opnsense_diag_log_gateways', { limit: '100' as unknown as number }, client);
    expect(client.get).toHaveBeenCalledWith('/diagnostics/log/core/gateways?limit=100');
  });

  it('handles API errors gracefully', async () => {
    const client = mockClient({
      get: vi.fn().mockRejectedValue(new Error('502 Bad Gateway')),
    });
    const result = await handleDiagnosticsTool('opnsense_diag_log_system', {}, client);
    expect(result.content[0].text).toContain('Error');
    expect(result.content[0].text).toContain('502');
  });
});
