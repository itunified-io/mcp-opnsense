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
  it('exports 10 tool definitions', () => {
    expect(systemToolDefinitions).toHaveLength(10);
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

describe('handleSystemTool — tunables (#133)', () => {
  it('lists configured tunables', async () => {
    const rows = [
      { uuid: 'aaaa-1111', tunable: 'dev.em.0.eee_control', value: '0', descr: 'EEE off' },
      { uuid: 'bbbb-2222', tunable: 'net.inet.tcp.recvspace', value: '262144', descr: '' },
    ];
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ rows, total: 2, rowCount: 2, current: 1 }),
    });

    const result = await handleSystemTool('opnsense_sys_tunable_list', {}, client);
    expect(result.content[0].text).toContain('dev.em.0.eee_control');
    expect(result.content[0].text).toContain('aaaa-1111');
    expect(client.post).toHaveBeenCalledWith('/system/settings/searchTunable', {});
  });

  it('gets a configured tunable by name', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({
        rows: [
          { uuid: 'aaaa-1111', tunable: 'dev.em.0.eee_control', value: '0', descr: 'EEE off' },
        ],
      }),
    });

    const result = await handleSystemTool(
      'opnsense_sys_tunable_get',
      { tunable: 'dev.em.0.eee_control' },
      client,
    );
    expect(result.content[0].text).toContain('aaaa-1111');
    expect(result.content[0].text).toContain('"value": "0"');
  });

  it('returns "not configured" sentinel when tunable is missing', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ rows: [] }),
    });

    const result = await handleSystemTool(
      'opnsense_sys_tunable_get',
      { tunable: 'dev.re.0.eee_disable' },
      client,
    );
    expect(result.content[0].text).toContain('"configured": false');
    expect(result.content[0].text).toContain('FreeBSD default');
  });

  it('rejects invalid tunable names', async () => {
    const client = mockClient();
    const result = await handleSystemTool(
      'opnsense_sys_tunable_get',
      { tunable: 'bad name with spaces' },
      client,
    );
    expect(result.content[0].text).toContain('Error');
  });

  it('adds a new tunable when not present, then applies', async () => {
    const post = vi
      .fn()
      // 1st call — searchTunable lookup, returns empty (not configured)
      .mockResolvedValueOnce({ rows: [] })
      // 2nd call — addTunable
      .mockResolvedValueOnce({ result: 'saved' })
      // 3rd call — reconfigure
      .mockResolvedValueOnce({ status: 'ok' });

    const client = mockClient({ post });

    const result = await handleSystemTool(
      'opnsense_sys_tunable_set',
      { tunable: 'dev.re.0.eee_disable', value: '1', descr: 'Disable EEE on Realtek LAN NIC' },
      client,
    );

    expect(result.content[0].text).toContain('"action": "added"');
    expect(result.content[0].text).toContain('"applied": true');
    expect(post).toHaveBeenNthCalledWith(1, '/system/settings/searchTunable', {});
    expect(post).toHaveBeenNthCalledWith(2, '/system/settings/addTunable', {
      tunable: {
        tunable: 'dev.re.0.eee_disable',
        value: '1',
        descr: 'Disable EEE on Realtek LAN NIC',
      },
    });
    expect(post).toHaveBeenNthCalledWith(3, '/system/settings/reconfigure');
  });

  it('updates an existing tunable when present', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { uuid: 'aaaa-1111', tunable: 'dev.em.0.eee_control', value: '1', descr: '' },
        ],
      })
      .mockResolvedValueOnce({ result: 'saved' })
      .mockResolvedValueOnce({ status: 'ok' });

    const client = mockClient({ post });

    const result = await handleSystemTool(
      'opnsense_sys_tunable_set',
      { tunable: 'dev.em.0.eee_control', value: '0' },
      client,
    );

    expect(result.content[0].text).toContain('"action": "updated"');
    expect(post).toHaveBeenNthCalledWith(2, '/system/settings/setTunable/aaaa-1111', {
      tunable: { tunable: 'dev.em.0.eee_control', value: '0', descr: '' },
    });
  });

  it('skips reconfigure when apply=false', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ result: 'saved' });

    const client = mockClient({ post });

    const result = await handleSystemTool(
      'opnsense_sys_tunable_set',
      { tunable: 'kern.ipc.somaxconn', value: '4096', apply: false },
      client,
    );

    expect(result.content[0].text).toContain('"applied": false');
    expect(post).toHaveBeenCalledTimes(2); // search + add, no reconfigure
  });
});
