/**
 * Opportunistic HashiCorp Vault AppRole secret loader.
 *
 * If `NAS_VAULT_ADDR` + `NAS_VAULT_ROLE_ID` + `NAS_VAULT_SECRET_ID` are set in
 * the environment, this module logs in via AppRole, reads a KV v2 secret, and
 * populates mapped keys into `process.env` — but only for env vars that are
 * not already set. This means `process.env` (explicit shell/MCP config) takes
 * precedence over Vault, which in turn takes precedence over `MCP_SECRETS_FILE`.
 *
 * Fully backwards compatible: if `NAS_VAULT_ADDR` is unset the loader is a
 * silent no-op. On any Vault error (network, auth, missing path, malformed
 * response) a single-line warning is written to stderr and the caller
 * continues with whatever env vars are already populated — the server will
 * then fail later with its usual "missing required env var" message.
 *
 * Security: secret values are NEVER logged. The KV path name may appear in
 * stderr diagnostics. No runtime dependencies — uses global `fetch` (Node 20+).
 */

export interface VaultLoaderOptions {
  /**
   * KV v2 path to read, e.g. "opnsense/bifrost". The loader will GET
   * `<addr>/v1/<mount>/data/<path>`.
   */
  kvPath: string;
  /**
   * Map of KV secret key → target environment variable name.
   * Only env vars that are currently undefined / empty will be populated.
   */
  mapping: Record<string, string>;
  /** Optional process.env override (for tests). */
  env?: NodeJS.ProcessEnv;
  /** Optional fetch override (for tests). */
  fetchImpl?: typeof fetch;
}

interface AppRoleLoginResponse {
  auth?: {
    client_token?: string;
  };
}

interface KvV2ReadResponse {
  data?: {
    data?: Record<string, unknown>;
  };
}

/**
 * Log in via AppRole and fetch a KV v2 secret, populating mapped env vars.
 *
 * Silent no-op unless `NAS_VAULT_ADDR`, `NAS_VAULT_ROLE_ID`, and
 * `NAS_VAULT_SECRET_ID` are all set.
 */
export async function loadFromVault(options: VaultLoaderOptions): Promise<void> {
  const env = options.env ?? process.env;
  const fetchFn = options.fetchImpl ?? fetch;

  const addr = env["NAS_VAULT_ADDR"];
  const roleId = env["NAS_VAULT_ROLE_ID"];
  const secretId = env["NAS_VAULT_SECRET_ID"];

  if (!addr || !roleId || !secretId) {
    // Not configured — fully backwards compatible no-op.
    return;
  }

  const mount = env["NAS_VAULT_KV_MOUNT"] || "kv";
  const base = addr.replace(/\/+$/, "");

  try {
    // 1. AppRole login
    const loginRes = await fetchFn(`${base}/v1/auth/approle/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
    });
    if (!loginRes.ok) {
      warn(`vault AppRole login failed: HTTP ${loginRes.status}`);
      return;
    }
    const loginJson = (await loginRes.json()) as AppRoleLoginResponse;
    const token = loginJson.auth?.client_token;
    if (!token) {
      warn("vault AppRole login response missing client_token");
      return;
    }

    // 2. KV v2 read
    const kvUrl = `${base}/v1/${mount}/data/${options.kvPath}`;
    const kvRes = await fetchFn(kvUrl, {
      method: "GET",
      headers: { "X-Vault-Token": token },
    });
    if (!kvRes.ok) {
      warn(`vault KV read failed for ${options.kvPath}: HTTP ${kvRes.status}`);
      return;
    }
    const kvJson = (await kvRes.json()) as KvV2ReadResponse;
    const data = kvJson.data?.data;
    if (!data || typeof data !== "object") {
      warn(`vault KV response for ${options.kvPath} missing data.data`);
      return;
    }

    // 3. Populate env vars per mapping, respecting existing values
    let populated = 0;
    for (const [kvKey, envVar] of Object.entries(options.mapping)) {
      const value = data[kvKey];
      if (typeof value !== "string" || value.length === 0) continue;
      if (env[envVar] !== undefined && env[envVar] !== "") continue;
      env[envVar] = value;
      populated += 1;
    }
    // Diagnostic only: path name + count, never values or key names.
    warn(`vault loaded ${populated} value(s) from ${options.kvPath}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`vault load error for ${options.kvPath}: ${msg}`);
  }
}

/** Single-line stderr diagnostic. Never writes secret values. */
function warn(msg: string): void {
  process.stderr.write(`[mcp vault-loader] ${msg}\n`);
}
