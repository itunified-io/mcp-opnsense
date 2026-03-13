import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OPNsenseClient } from '../../src/client/opnsense-client.js';

describe('OPNsenseClient', () => {
  describe('fromEnv', () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
    });

    it('creates client from environment variables', () => {
      vi.stubEnv('OPNSENSE_URL', 'https://10.10.0.1');
      vi.stubEnv('OPNSENSE_API_KEY', 'test-key');
      vi.stubEnv('OPNSENSE_API_SECRET', 'test-secret');

      const client = OPNsenseClient.fromEnv();
      expect(client).toBeInstanceOf(OPNsenseClient);
    });

    it('throws when OPNSENSE_URL is missing', () => {
      vi.stubEnv('OPNSENSE_API_KEY', 'test-key');
      vi.stubEnv('OPNSENSE_API_SECRET', 'test-secret');
      delete process.env.OPNSENSE_URL;

      expect(() => OPNsenseClient.fromEnv()).toThrow('OPNSENSE_URL');
    });

    it('throws when OPNSENSE_API_KEY is missing', () => {
      vi.stubEnv('OPNSENSE_URL', 'https://10.10.0.1');
      vi.stubEnv('OPNSENSE_API_SECRET', 'test-secret');
      delete process.env.OPNSENSE_API_KEY;

      expect(() => OPNsenseClient.fromEnv()).toThrow('OPNSENSE_API_KEY');
    });

    it('throws when OPNSENSE_API_SECRET is missing', () => {
      vi.stubEnv('OPNSENSE_URL', 'https://10.10.0.1');
      vi.stubEnv('OPNSENSE_API_KEY', 'test-key');
      delete process.env.OPNSENSE_API_SECRET;

      expect(() => OPNsenseClient.fromEnv()).toThrow('OPNSENSE_API_SECRET');
    });
  });

  describe('constructor', () => {
    it('creates client with default SSL and timeout', () => {
      const client = new OPNsenseClient({
        url: 'https://10.10.0.1',
        apiKey: 'key',
        apiSecret: 'secret',
      });
      expect(client).toBeInstanceOf(OPNsenseClient);
    });

    it('creates client with custom SSL and timeout', () => {
      const client = new OPNsenseClient({
        url: 'https://10.10.0.1',
        apiKey: 'key',
        apiSecret: 'secret',
        verifySsl: false,
        timeout: 5000,
      });
      expect(client).toBeInstanceOf(OPNsenseClient);
    });
  });
});
