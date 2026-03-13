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
      get: vi.fn().mockResolvedValue({ hostname: 'fw-test', uptime: '5d' }),
    });

    const result = await handleSystemTool('opnsense_sys_info', {}, client);
    expect(result.content[0].text).toContain('fw-test');
    expect(client.get).toHaveBeenCalledWith('/core/system/status');
  });

  it('lists backups', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        items: [{ id: 'config-123.xml', time_iso: '2026-03-13T16:00:00+00:00', description: 'test' }],
      }),
    });

    const result = await handleSystemTool('opnsense_sys_backup_list', {}, client);
    expect(result.content[0].text).toContain('config-123.xml');
    expect(client.get).toHaveBeenCalledWith('/core/backup/backups/this');
  });

  it('downloads current config', async () => {
    const client = mockClient({
      getRaw: vi.fn().mockResolvedValue('<opnsense><system></system></opnsense>'),
    });

    const result = await handleSystemTool('opnsense_sys_backup_download', {}, client);
    expect(result.content[0].text).toContain('<opnsense>');
    expect(client.getRaw).toHaveBeenCalledWith('/core/backup/download/this');
  });

  it('downloads specific backup by id', async () => {
    const client = mockClient({
      getRaw: vi.fn().mockResolvedValue('<opnsense></opnsense>'),
    });

    const result = await handleSystemTool('opnsense_sys_backup_download', {
      backup_id: 'config-123.xml',
    }, client);
    expect(client.getRaw).toHaveBeenCalledWith('/core/backup/download/this/config-123.xml');
  });

  it('reverts to a backup', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const result = await handleSystemTool('opnsense_sys_backup_revert', {
      backup_id: 'config-123.xml',
    }, client);
    expect(result.content[0].text).toContain('ok');
    expect(client.post).toHaveBeenCalledWith('/core/backup/revertBackup/config-123.xml');
  });

  it('lists certificates from trust store', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        rows: [
          { refid: '674eb8952f75f', descr: 'Self-signed cert' },
          { refid: '69b4367c83731', descr: 'fw.example.com (ACME)' },
        ],
      }),
    });

    const result = await handleSystemTool('opnsense_sys_list_certs', {}, client);
    expect(result.content[0].text).toContain('674eb8952f75f');
    expect(result.content[0].text).toContain('69b4367c83731');
    expect(client.get).toHaveBeenCalledWith('/trust/cert/search');
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
