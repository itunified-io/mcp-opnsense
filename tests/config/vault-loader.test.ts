import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadFromVault } from "../../src/config/vault-loader.js";

/**
 * Minimal Response-shaped stub for the global `fetch` mock.
 * We only use .ok, .status, and .json().
 */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

function makeEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe("loadFromVault", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is a silent no-op when NAS_VAULT_ADDR is unset", async () => {
    const env = makeEnv({});
    const fetchImpl = vi.fn();
    await loadFromVault({
      kvPath: "opnsense/bifrost",
      mapping: { api_key: "OPNSENSE_API_KEY" },
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(env.OPNSENSE_API_KEY).toBeUndefined();
  });

  it("is a silent no-op when role_id / secret_id missing", async () => {
    const env = makeEnv({ NAS_VAULT_ADDR: "https://vault.example" });
    const fetchImpl = vi.fn();
    await loadFromVault({
      kvPath: "opnsense/bifrost",
      mapping: { api_key: "OPNSENSE_API_KEY" },
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("logs in via AppRole and populates env vars from KV v2", async () => {
    const env = makeEnv({
      NAS_VAULT_ADDR: "https://vault.example",
      NAS_VAULT_ROLE_ID: "rid",
      NAS_VAULT_SECRET_ID: "sid",
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ auth: { client_token: "tok-xyz" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            data: {
              url: "https://fw.example",
              api_key: "KEY-123",
              api_secret: "SEC-456",
            },
          },
        }),
      );

    await loadFromVault({
      kvPath: "opnsense/bifrost",
      mapping: {
        url: "OPNSENSE_URL",
        api_key: "OPNSENSE_API_KEY",
        api_secret: "OPNSENSE_API_SECRET",
      },
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(env.OPNSENSE_URL).toBe("https://fw.example");
    expect(env.OPNSENSE_API_KEY).toBe("KEY-123");
    expect(env.OPNSENSE_API_SECRET).toBe("SEC-456");

    // Login call
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://vault.example/v1/auth/approle/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ role_id: "rid", secret_id: "sid" }),
      }),
    );
    // KV read call
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://vault.example/v1/kv/data/opnsense/bifrost",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "X-Vault-Token": "tok-xyz" }),
      }),
    );
  });

  it("respects pre-existing process.env values (does not overwrite)", async () => {
    const env = makeEnv({
      NAS_VAULT_ADDR: "https://vault.example",
      NAS_VAULT_ROLE_ID: "rid",
      NAS_VAULT_SECRET_ID: "sid",
      OPNSENSE_API_KEY: "EXPLICIT",
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ auth: { client_token: "tok" } }))
      .mockResolvedValueOnce(
        jsonResponse({ data: { data: { api_key: "VAULT", api_secret: "SEC" } } }),
      );

    await loadFromVault({
      kvPath: "opnsense/bifrost",
      mapping: {
        api_key: "OPNSENSE_API_KEY",
        api_secret: "OPNSENSE_API_SECRET",
      },
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(env.OPNSENSE_API_KEY).toBe("EXPLICIT"); // unchanged
    expect(env.OPNSENSE_API_SECRET).toBe("SEC"); // populated
  });

  it("honors NAS_VAULT_KV_MOUNT override", async () => {
    const env = makeEnv({
      NAS_VAULT_ADDR: "https://vault.example/",
      NAS_VAULT_ROLE_ID: "rid",
      NAS_VAULT_SECRET_ID: "sid",
      NAS_VAULT_KV_MOUNT: "secret",
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ auth: { client_token: "tok" } }))
      .mockResolvedValueOnce(jsonResponse({ data: { data: { api_key: "K" } } }));

    await loadFromVault({
      kvPath: "opnsense/bifrost",
      mapping: { api_key: "OPNSENSE_API_KEY" },
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    // Trailing slash on addr is stripped, mount override respected
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://vault.example/v1/secret/data/opnsense/bifrost",
      expect.anything(),
    );
  });

  it("does not throw when login fails (HTTP 400)", async () => {
    const env = makeEnv({
      NAS_VAULT_ADDR: "https://vault.example",
      NAS_VAULT_ROLE_ID: "rid",
      NAS_VAULT_SECRET_ID: "bad",
    });
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}, false, 400));

    await expect(
      loadFromVault({
        kvPath: "opnsense/bifrost",
        mapping: { api_key: "OPNSENSE_API_KEY" },
        env,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBeUndefined();

    expect(env.OPNSENSE_API_KEY).toBeUndefined();
  });

  it("does not throw when KV read fails (HTTP 404)", async () => {
    const env = makeEnv({
      NAS_VAULT_ADDR: "https://vault.example",
      NAS_VAULT_ROLE_ID: "rid",
      NAS_VAULT_SECRET_ID: "sid",
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ auth: { client_token: "tok" } }))
      .mockResolvedValueOnce(jsonResponse({}, false, 404));

    await expect(
      loadFromVault({
        kvPath: "opnsense/bifrost",
        mapping: { api_key: "OPNSENSE_API_KEY" },
        env,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBeUndefined();
  });

  it("does not throw on fetch network error", async () => {
    const env = makeEnv({
      NAS_VAULT_ADDR: "https://vault.example",
      NAS_VAULT_ROLE_ID: "rid",
      NAS_VAULT_SECRET_ID: "sid",
    });
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      loadFromVault({
        kvPath: "opnsense/bifrost",
        mapping: { api_key: "OPNSENSE_API_KEY" },
        env,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBeUndefined();
  });

  it("ignores mapping entries whose KV keys are absent or non-string", async () => {
    const env = makeEnv({
      NAS_VAULT_ADDR: "https://vault.example",
      NAS_VAULT_ROLE_ID: "rid",
      NAS_VAULT_SECRET_ID: "sid",
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ auth: { client_token: "tok" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            data: {
              api_key: "K",
              api_secret: 42, // wrong type — should be ignored
              // url missing entirely
            },
          },
        }),
      );

    await loadFromVault({
      kvPath: "opnsense/bifrost",
      mapping: {
        url: "OPNSENSE_URL",
        api_key: "OPNSENSE_API_KEY",
        api_secret: "OPNSENSE_API_SECRET",
      },
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(env.OPNSENSE_API_KEY).toBe("K");
    expect(env.OPNSENSE_API_SECRET).toBeUndefined();
    expect(env.OPNSENSE_URL).toBeUndefined();
  });
});
