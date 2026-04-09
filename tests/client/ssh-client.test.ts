import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SshClient, shellQuote } from "../../src/client/ssh-client.js";

describe("shellQuote", () => {
  it("leaves safe tokens untouched", () => {
    expect(shellQuote("opt1")).toBe("opt1");
    expect(shellQuote("vlan10")).toBe("vlan10");
    expect(shellQuote("--slot=opt1")).toBe("--slot=opt1");
    expect(shellQuote("/usr/local/opnsense/scripts/mcp/if_assign.php")).toBe(
      "/usr/local/opnsense/scripts/mcp/if_assign.php",
    );
  });

  it("wraps values with whitespace in single quotes", () => {
    expect(shellQuote("home VLAN")).toBe("'home VLAN'");
    expect(shellQuote("--descr=home VLAN")).toBe("'--descr=home VLAN'");
  });

  it("escapes embedded single quotes", () => {
    expect(shellQuote("it's fine")).toBe(`'it'\\''s fine'`);
  });

  it("quotes the empty string", () => {
    expect(shellQuote("")).toBe("''");
  });

  it("quotes shell metacharacters", () => {
    expect(shellQuote("a;b")).toBe("'a;b'");
    expect(shellQuote("a|b")).toBe("'a|b'");
    expect(shellQuote("a$(b)")).toBe("'a$(b)'");
    expect(shellQuote("a`b`")).toBe("'a`b`'");
  });
});

describe("SshClient", () => {
  let tmpDir: string;
  let keyPath: string;
  let knownHostsPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ssh-client-test-"));
    keyPath = join(tmpDir, "id_test");
    knownHostsPath = join(tmpDir, "known_hosts");
    writeFileSync(keyPath, "fake-key", { mode: 0o600 });
    writeFileSync(knownHostsPath, "fake host key line\n");
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("constructor", () => {
    it("throws when key file does not exist", () => {
      expect(
        () =>
          new SshClient({
            host: "h",
            user: "u",
            keyPath: join(tmpDir, "missing"),
            knownHostsPath,
          }),
      ).toThrow(/SSH key not found/);
    });

    it("throws when known_hosts file does not exist", () => {
      expect(
        () =>
          new SshClient({
            host: "h",
            user: "u",
            keyPath,
            knownHostsPath: join(tmpDir, "missing"),
          }),
      ).toThrow(/known_hosts file not found/);
    });

    it("accepts a valid config", () => {
      const client = new SshClient({ host: "h", user: "u", keyPath, knownHostsPath });
      expect(client).toBeInstanceOf(SshClient);
    });
  });

  describe("fromEnv", () => {
    it("returns null when OPNSENSE_SSH_ENABLED is not set", () => {
      expect(SshClient.fromEnv()).toBeNull();
    });

    it("returns null when OPNSENSE_SSH_ENABLED is false", () => {
      vi.stubEnv("OPNSENSE_SSH_ENABLED", "false");
      expect(SshClient.fromEnv()).toBeNull();
    });

    it("builds a client when all required vars are set", () => {
      vi.stubEnv("OPNSENSE_SSH_ENABLED", "true");
      vi.stubEnv("OPNSENSE_SSH_HOST", "fw.example.com");
      vi.stubEnv("OPNSENSE_SSH_USER", "claude");
      vi.stubEnv("OPNSENSE_SSH_KEY_PATH", keyPath);
      vi.stubEnv("OPNSENSE_SSH_KNOWN_HOSTS", knownHostsPath);
      const client = SshClient.fromEnv();
      expect(client).toBeInstanceOf(SshClient);
    });

    it("throws when OPNSENSE_SSH_HOST is missing", () => {
      vi.stubEnv("OPNSENSE_SSH_ENABLED", "true");
      vi.stubEnv("OPNSENSE_SSH_USER", "claude");
      vi.stubEnv("OPNSENSE_SSH_KEY_PATH", keyPath);
      vi.stubEnv("OPNSENSE_SSH_KNOWN_HOSTS", knownHostsPath);
      expect(() => SshClient.fromEnv()).toThrow(/OPNSENSE_SSH_HOST/);
    });

    it("throws when the key file does not exist", () => {
      vi.stubEnv("OPNSENSE_SSH_ENABLED", "true");
      vi.stubEnv("OPNSENSE_SSH_HOST", "fw.example.com");
      vi.stubEnv("OPNSENSE_SSH_USER", "claude");
      vi.stubEnv("OPNSENSE_SSH_KEY_PATH", join(tmpDir, "missing"));
      vi.stubEnv("OPNSENSE_SSH_KNOWN_HOSTS", knownHostsPath);
      expect(() => SshClient.fromEnv()).toThrow(/SSH key not found/);
    });
  });

  describe("buildSshArgv", () => {
    it("assembles argv with strict host key checking and batch mode", () => {
      const client = new SshClient({
        host: "fw.example.com",
        user: "claude",
        keyPath,
        knownHostsPath,
      });
      const argv = client.buildSshArgv("whoami");
      expect(argv).toEqual([
        "-i",
        keyPath,
        "-o",
        `UserKnownHostsFile=${knownHostsPath}`,
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "BatchMode=yes",
        "-o",
        "PreferredAuthentications=publickey",
        "-o",
        "ConnectTimeout=10",
        "claude@fw.example.com",
        "whoami",
      ]);
    });

    it("includes custom port when configured", () => {
      const client = new SshClient({
        host: "fw.example.com",
        user: "claude",
        keyPath,
        knownHostsPath,
        port: 2222,
      });
      const argv = client.buildSshArgv("whoami");
      expect(argv).toContain("-p");
      expect(argv).toContain("2222");
    });
  });

  describe("buildHelperCommand", () => {
    let client: SshClient;
    beforeEach(() => {
      client = new SshClient({ host: "h", user: "u", keyPath, knownHostsPath });
    });

    it("inserts the mandatory -- separator (ADR-0092)", () => {
      const cmd = client.buildHelperCommand("if_assign.php", [
        "--slot=opt1",
        "--if=vlan10",
      ]);
      expect(cmd).toBe(
        "sudo php -f /usr/local/opnsense/scripts/mcp/if_assign.php -- --slot=opt1 --if=vlan10",
      );
    });

    it("quotes args containing whitespace", () => {
      const cmd = client.buildHelperCommand("if_assign.php", [
        "--slot=opt1",
        "--if=vlan10",
        "--descr=home VLAN",
      ]);
      expect(cmd).toBe(
        "sudo php -f /usr/local/opnsense/scripts/mcp/if_assign.php -- --slot=opt1 --if=vlan10 '--descr=home VLAN'",
      );
    });

    it("honors a custom helperDir", () => {
      const client2 = new SshClient({
        host: "h",
        user: "u",
        keyPath,
        knownHostsPath,
        helperDir: "/opt/custom",
      });
      const cmd = client2.buildHelperCommand("if_assign.php", ["--slot=opt1"]);
      expect(cmd).toBe("sudo php -f /opt/custom/if_assign.php -- --slot=opt1");
    });

    it("refuses to let a shell metacharacter break out", () => {
      const cmd = client.buildHelperCommand("if_assign.php", [
        "--slot=opt1",
        "--if=vlan10; rm -rf /",
      ]);
      // The malicious value is wrapped in single quotes
      expect(cmd).toContain(`'--if=vlan10; rm -rf /'`);
      // And there is no unquoted `;` outside the quoted region
      const beforeQuoted = cmd.split("'--if=vlan10; rm -rf /'")[0];
      expect(beforeQuoted).not.toContain(";");
    });
  });
});
