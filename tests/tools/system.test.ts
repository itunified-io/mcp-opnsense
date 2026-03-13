import { describe, it, expect, vi } from 'vitest';
import { systemToolDefinitions, handleSystemTool } from '../../src/tools/system.js';
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

describe('System Tool Definitions', () => {
  it('exports 7 tool definitions', () => {
    expect(systemToolDefinitions).toHaveLength(7);
  });

  it('all tools have opnsense_ prefix', () => {
    for (const tool of systemToolDefinitions) {
      expect(tool.name).toMatch(/^opnsense_/);
    }
  });

  it('all tools have descriptions', () => {
    for (const tool of systemToolDefinitions) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });
});

describe('handleSystemTool', () => {
  it('gets system info', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ hostname: 'bifrost', uptime: '5d' }),
    });

    const result = await handleSystemTool('opnsense_sys_info', {}, client);
    expect(result.content[0].text).toContain('bifrost');
    expect(client.get).toHaveBeenCalledWith('/core/system/status');
  });

  it('lists certificates from trust store', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        rows: [
          { refid: '674eb8952f75f', descr: 'Self-signed cert' },
          { refid: '69b4367c83731', descr: 'bifrost.itunified.io (ACME)' },
        ],
      }),
    });

    const result = await handleSystemTool('opnsense_sys_list_certs', {}, client);
    expect(result.content[0].text).toContain('674eb8952f75f');
    expect(result.content[0].text).toContain('69b4367c83731');
    expect(client.get).toHaveBeenCalledWith('/trust/cert/search');
  });

  it('sets webgui cert successfully', async () => {
    const configXml = '<opnsense><system><webgui><ssl-certref>old-ref</ssl-certref></webgui></system></opnsense>';
    const getRaw = vi.fn().mockResolvedValue(configXml);
    const get = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          { refid: 'old-ref', descr: 'Old cert' },
          { refid: 'new-ref', descr: 'New ACME cert' },
        ],
      });
    const post = vi.fn().mockResolvedValue({ status: 'ok' });

    const client = mockClient({ get, getRaw, post });

    const result = await handleSystemTool('opnsense_sys_set_webgui_cert', {
      cert_refid: 'new-ref',
      confirm: true,
    }, client);

    expect(result.content[0].text).toContain('new-ref');
    expect(result.content[0].text).toContain('New ACME cert');

    // Verify backup was downloaded
    expect(getRaw).toHaveBeenCalledWith('/core/backup/download/this');

    // Verify modified config was restored with new refid
    expect(post).toHaveBeenCalledWith('/core/backup/restore', {
      backupdata: expect.stringContaining('<ssl-certref>new-ref</ssl-certref>'),
    });

    // Verify webgui restart was triggered
    expect(post).toHaveBeenCalledWith('/core/service/restart/webgui');
  });

  it('rejects webgui cert if refid not found', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        rows: [{ refid: 'existing-ref', descr: 'Existing cert' }],
      }),
    });

    const result = await handleSystemTool('opnsense_sys_set_webgui_cert', {
      cert_refid: 'nonexistent-ref',
      confirm: true,
    }, client);

    expect(result.content[0].text).toContain('not found');
    expect(result.content[0].text).toContain('existing-ref');
  });

  it('skips if webgui already uses the requested cert', async () => {
    const configXml = '<opnsense><system><webgui><ssl-certref>same-ref</ssl-certref></webgui></system></opnsense>';
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        rows: [{ refid: 'same-ref', descr: 'Current cert' }],
      }),
      getRaw: vi.fn().mockResolvedValue(configXml),
    });

    const result = await handleSystemTool('opnsense_sys_set_webgui_cert', {
      cert_refid: 'same-ref',
      confirm: true,
    }, client);

    expect(result.content[0].text).toContain('already uses');
  });

  it('requires confirm=true for webgui cert change', async () => {
    const client = mockClient();

    const result = await handleSystemTool('opnsense_sys_set_webgui_cert', {
      cert_refid: 'new-ref',
      confirm: false,
    }, client);

    expect(result.content[0].text).toContain('Error');
  });

  it('lists services', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ rows: [{ name: 'unbound', running: true }] }),
    });

    const result = await handleSystemTool('opnsense_svc_list', {}, client);
    expect(result.content[0].text).toContain('unbound');
    expect(client.get).toHaveBeenCalledWith('/core/service/search');
  });

  it('controls a service', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ response: 'OK' }),
    });

    const result = await handleSystemTool('opnsense_svc_control', {
      service_name: 'unbound',
      action: 'restart',
    }, client);

    expect(result.content[0].text).toContain('OK');
    expect(client.post).toHaveBeenCalledWith('/core/service/restart/unbound');
  });

  it('returns error for unknown tool', async () => {
    const client = mockClient();
    const result = await handleSystemTool('opnsense_sys_nonexistent', {}, client);
    expect(result.content[0].text).toContain('Unknown');
  });
});
