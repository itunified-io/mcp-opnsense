import { describe, it, expect, vi } from 'vitest';
import { firmwareToolDefinitions, handleFirmwareTool } from '../../src/tools/firmware.js';
import type { OPNsenseClient } from '../../src/client/opnsense-client.js';

function mockClient(overrides: Partial<OPNsenseClient> = {}): OPNsenseClient {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({ status: 'ok' }),
    delete: vi.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  } as unknown as OPNsenseClient;
}

describe('Firmware Tool Definitions', () => {
  it('exports 9 tool definitions', () => {
    expect(firmwareToolDefinitions).toHaveLength(9);
  });

  it('all tools have opnsense_firmware_ prefix', () => {
    for (const tool of firmwareToolDefinitions) {
      expect(tool.name).toMatch(/^opnsense_firmware_/);
    }
  });

  it('all tools have descriptions', () => {
    for (const tool of firmwareToolDefinitions) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it('all tools have inputSchema', () => {
    for (const tool of firmwareToolDefinitions) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

describe('handleFirmwareTool', () => {
  it('gets firmware info', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ product_version: '24.7', product_arch: 'amd64' }),
    });

    const result = await handleFirmwareTool('opnsense_firmware_info', {}, client);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('24.7');
    expect(client.get).toHaveBeenCalledWith('/core/firmware/info');
  });

  it('gets firmware status', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ status: 'done', status_msg: 'up to date' }),
    });

    const result = await handleFirmwareTool('opnsense_firmware_status', {}, client);
    expect(result.content[0].text).toContain('done');
    expect(client.get).toHaveBeenCalledWith('/core/firmware/status');
  });

  it('lists plugins from firmware info', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        package: [
          { name: 'os-acme-client', version: '4.5', installed: '1' },
          { name: 'os-haproxy', version: '4.3', installed: '0' },
        ],
      }),
    });

    const result = await handleFirmwareTool('opnsense_firmware_list_plugins', {}, client);
    expect(result.content[0].text).toContain('os-acme-client');
    expect(result.content[0].text).toContain('os-haproxy');
    expect(client.get).toHaveBeenCalledWith('/core/firmware/info');
  });

  it('installs a plugin package', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const result = await handleFirmwareTool('opnsense_firmware_install', {
      package: 'os-acme-client',
    }, client);

    expect(result.content[0].text).toContain('ok');
    expect(client.post).toHaveBeenCalledWith('/core/firmware/install/os-acme-client');
  });

  it('removes a plugin package with confirmation', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const result = await handleFirmwareTool('opnsense_firmware_remove', {
      package: 'os-acme-client',
      confirm: true,
    }, client);

    expect(result.content[0].text).toContain('ok');
    expect(client.post).toHaveBeenCalledWith('/core/firmware/remove/os-acme-client');
  });

  it('rejects remove without confirmation', async () => {
    const client = mockClient();
    const result = await handleFirmwareTool('opnsense_firmware_remove', {
      package: 'os-acme-client',
      confirm: false,
    }, client);

    expect(result.content[0].text).toContain('Error');
  });

  it('rejects install with empty package name', async () => {
    const client = mockClient();
    const result = await handleFirmwareTool('opnsense_firmware_install', {
      package: '',
    }, client);

    expect(result.content[0].text).toContain('Error');
  });

  it('returns error for unknown tool', async () => {
    const client = mockClient();
    const result = await handleFirmwareTool('opnsense_firmware_nonexistent', {}, client);
    expect(result.content[0].text).toContain('Unknown');
  });

  it('triggers a firmware check (refresh repo)', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok' }),
    });
    const result = await handleFirmwareTool('opnsense_firmware_check', {}, client);
    expect(result.content[0].text).toContain('ok');
    expect(client.post).toHaveBeenCalledWith('/core/firmware/check');
  });

  it('triggers a system upgrade with confirmation', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok', msg_uuid: 'abc-123' }),
    });

    const result = await handleFirmwareTool('opnsense_firmware_upgrade', { confirm: true }, client);

    expect(result.content[0].text).toContain('ok');
    expect(client.post).toHaveBeenCalledWith('/core/firmware/upgrade');
  });

  it('coerces string "true" to true on upgrade confirm (MCP transport)', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok', msg_uuid: 'abc-123' }),
    });
    const result = await handleFirmwareTool(
      'opnsense_firmware_upgrade',
      { confirm: 'true' as unknown as true },
      client,
    );
    expect(result.content[0].text).toContain('ok');
    expect(client.post).toHaveBeenCalledWith('/core/firmware/upgrade');
  });

  it('coerces string "true" to true on reboot confirm', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok' }),
    });
    const result = await handleFirmwareTool(
      'opnsense_firmware_reboot',
      { confirm: 'true' as unknown as true },
      client,
    );
    expect(result.content[0].text).toContain('ok');
    expect(client.post).toHaveBeenCalledWith('/core/firmware/reboot');
  });

  it('coerces string "true" to true on remove confirm', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok' }),
    });
    const result = await handleFirmwareTool(
      'opnsense_firmware_remove',
      { package: 'os-acme-client', confirm: 'true' as unknown as true },
      client,
    );
    expect(client.post).toHaveBeenCalledWith('/core/firmware/remove/os-acme-client');
  });

  it('rejects upgrade without confirmation', async () => {
    const client = mockClient();
    const result = await handleFirmwareTool('opnsense_firmware_upgrade', { confirm: false }, client);
    expect(result.content[0].text).toContain('Error');
    expect(client.post).not.toHaveBeenCalled();
  });

  it('rejects upgrade with no args', async () => {
    const client = mockClient();
    const result = await handleFirmwareTool('opnsense_firmware_upgrade', {}, client);
    expect(result.content[0].text).toContain('Error');
    expect(client.post).not.toHaveBeenCalled();
  });

  it('gets upgrade status (long-running progress)', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ status: 'running', log: 'downloading...' }),
    });

    const result = await handleFirmwareTool('opnsense_firmware_upgrade_status', {}, client);
    expect(result.content[0].text).toContain('running');
    expect(client.get).toHaveBeenCalledWith('/core/firmware/upgradestatus');
  });

  it('triggers a reboot with confirmation', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: 'ok' }),
    });

    const result = await handleFirmwareTool('opnsense_firmware_reboot', { confirm: true }, client);

    expect(result.content[0].text).toContain('ok');
    expect(client.post).toHaveBeenCalledWith('/core/firmware/reboot');
  });

  it('rejects reboot without confirmation', async () => {
    const client = mockClient();
    const result = await handleFirmwareTool('opnsense_firmware_reboot', { confirm: false }, client);
    expect(result.content[0].text).toContain('Error');
    expect(client.post).not.toHaveBeenCalled();
  });

  it('handles API errors gracefully', async () => {
    const client = mockClient({
      get: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });

    const result = await handleFirmwareTool('opnsense_firmware_info', {}, client);
    expect(result.content[0].text).toContain('Error');
    expect(result.content[0].text).toContain('Connection refused');
  });
});
