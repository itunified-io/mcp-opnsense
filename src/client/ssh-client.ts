import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

/**
 * Configuration for the SSH client.
 *
 * All fields except `port` and `helperDir` are required. `fromEnv()` reads these
 * from `OPNSENSE_SSH_*` environment variables and throws if any required value
 * is missing or if the key / known_hosts files do not exist on disk.
 */
export interface SshClientConfig {
  host: string;
  user: string;
  keyPath: string;
  knownHostsPath: string;
  port?: number;
  helperDir?: string;
  connectTimeoutSec?: number;
}

export interface SshRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Helper-script JSON response. The PHP helpers in `opnsense-helpers/` emit a
 * single JSON object on stdout. On success `ok=true`; on any failure the
 * helper sets `ok=false` and the process exit code carries the error class
 * (1 args, 2 state, 3 validation, 4 write_config, 5 interfaces_configure).
 */
export interface HelperResponse {
  ok: boolean;
  error?: string;
  warning?: string;
  [key: string]: unknown;
}

export class SshClientError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stdout: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "SshClientError";
  }
}

/**
 * Minimal SSH client backed by the system `ssh` binary via `spawn()` with an
 * argv array (no new runtime deps, no local shell).
 *
 * Security posture:
 *   - Strict host key checking is enforced via `UserKnownHostsFile=<path>` +
 *     `StrictHostKeyChecking=yes`. There is no TOFU fallback.
 *   - Password / keyboard-interactive auth is disabled via
 *     `PreferredAuthentications=publickey` + `BatchMode=yes`.
 *   - Arguments are shell-quoted with a strict quoter before being
 *     concatenated into the remote command string, so untrusted input cannot
 *     break out of the intended argv on the remote side.
 *   - No shell is invoked locally; we `spawn("ssh", [...])` directly. The
 *     remote side DOES see a shell (sshd ExecShell), which is why the
 *     per-argument quoting matters.
 */
export class SshClient {
  constructor(private readonly config: SshClientConfig) {
    if (!existsSync(config.keyPath)) {
      throw new Error(`SSH key not found at ${config.keyPath}`);
    }
    if (!existsSync(config.knownHostsPath)) {
      throw new Error(
        `SSH known_hosts file not found at ${config.knownHostsPath} ` +
          `(strict host key checking requires a pre-populated file)`,
      );
    }
  }

  /**
   * Build an SshClient from `OPNSENSE_SSH_*` environment variables.
   * Returns `null` if `OPNSENSE_SSH_ENABLED` is not `true`.
   * Throws if SSH is enabled but required vars are missing or files don't exist.
   */
  static fromEnv(): SshClient | null {
    const enabled = (process.env.OPNSENSE_SSH_ENABLED ?? "").toLowerCase();
    if (enabled !== "true" && enabled !== "1" && enabled !== "yes") {
      return null;
    }

    const host = requireEnv("OPNSENSE_SSH_HOST");
    const user = requireEnv("OPNSENSE_SSH_USER");
    const keyPath = expandTilde(requireEnv("OPNSENSE_SSH_KEY_PATH"));
    const knownHostsPath = expandTilde(requireEnv("OPNSENSE_SSH_KNOWN_HOSTS"));
    const port = process.env.OPNSENSE_SSH_PORT
      ? Number.parseInt(process.env.OPNSENSE_SSH_PORT, 10)
      : undefined;
    const helperDir = process.env.OPNSENSE_SSH_HELPER_DIR;
    const connectTimeoutSec = process.env.OPNSENSE_SSH_CONNECT_TIMEOUT
      ? Number.parseInt(process.env.OPNSENSE_SSH_CONNECT_TIMEOUT, 10)
      : undefined;

    return new SshClient({
      host,
      user,
      keyPath,
      knownHostsPath,
      port,
      helperDir,
      connectTimeoutSec,
    });
  }

  /** Remote helper directory (defaults to `/usr/local/opnsense/scripts/mcp`). */
  get helperDir(): string {
    return this.config.helperDir ?? "/usr/local/opnsense/scripts/mcp";
  }

  /**
   * Build the ssh(1) argv for the given remote command. Exposed for testing.
   */
  buildSshArgv(remoteCommand: string): string[] {
    const argv: string[] = [
      "-i",
      this.config.keyPath,
      "-o",
      `UserKnownHostsFile=${this.config.knownHostsPath}`,
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "BatchMode=yes",
      "-o",
      "PreferredAuthentications=publickey",
      "-o",
      `ConnectTimeout=${this.config.connectTimeoutSec ?? 10}`,
    ];
    if (this.config.port !== undefined) {
      argv.push("-p", String(this.config.port));
    }
    argv.push(`${this.config.user}@${this.config.host}`, remoteCommand);
    return argv;
  }

  /**
   * Build the remote command string for a PHP helper invocation. Exposed for
   * testing — the `--` separator is mandatory (ADR-0092): PHP CLI would
   * otherwise swallow long options like `--slot=opt1` as its own arguments.
   */
  buildHelperCommand(script: string, args: string[]): string {
    const absScript = `${this.helperDir}/${script}`;
    return [
      "sudo",
      "php",
      "-f",
      shellQuote(absScript),
      "--",
      ...args.map(shellQuote),
    ].join(" ");
  }

  /**
   * Run a PHP helper with the given CLI arguments and parse the resulting
   * single JSON object. Throws `SshClientError` if the helper cannot be run
   * or if stdout is not valid JSON.
   */
  async runHelper(script: string, args: string[]): Promise<{
    response: HelperResponse;
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    const remoteCommand = this.buildHelperCommand(script, args);
    const result = await this.runRemote(remoteCommand);

    let response: HelperResponse;
    try {
      response = JSON.parse(result.stdout.trim()) as HelperResponse;
    } catch {
      throw new SshClientError(
        `helper ${script} did not emit valid JSON on stdout (exit ${result.exitCode})`,
        result.exitCode,
        result.stdout,
        result.stderr,
      );
    }

    return {
      response,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  /**
   * Run a raw command on the remote host. Prefer `runHelper()` for the PHP
   * scripts — this is the low-level primitive.
   */
  runRemote(remoteCommand: string): Promise<SshRunResult> {
    const argv = this.buildSshArgv(remoteCommand);
    return new Promise((resolve, reject) => {
      const child = spawn("ssh", argv, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (err) => {
        reject(
          new SshClientError(
            `failed to spawn ssh: ${err.message}`,
            null,
            stdout,
            stderr,
          ),
        );
      });
      child.on("close", (code) => {
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });
    });
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `${name} is required when OPNSENSE_SSH_ENABLED=true (SSH-backed tools cannot run without it)`,
    );
  }
  return value;
}

function expandTilde(path: string): string {
  if (path.startsWith("~/")) {
    return `${homedir()}/${path.slice(2)}`;
  }
  if (path === "~") {
    return homedir();
  }
  return path;
}

/**
 * POSIX shell quoter: wraps the string in single quotes and escapes embedded
 * single quotes via the standard `'\''` pattern. Safe for any argv value.
 */
export function shellQuote(value: string): string {
  if (value === "") return "''";
  // Allow a conservative safe set to keep common invocations readable in logs.
  if (/^[A-Za-z0-9_\-./:=@+,]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
