import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseSecretsFile,
  expandTilde,
  loadSecretsFile,
} from "../../src/config/secrets-file.js";

describe("parseSecretsFile", () => {
  it("parses simple KEY=value lines", () => {
    const result = parseSecretsFile("FOO=bar\nBAZ=qux\n");
    expect(result).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("strips `export` prefix", () => {
    const result = parseSecretsFile("export FOO=bar\nexport BAZ=qux");
    expect(result.FOO).toBe("bar");
    expect(result.BAZ).toBe("qux");
  });

  it("strips double and single quotes", () => {
    const result = parseSecretsFile(`A="hello"\nB='world'\nC=plain`);
    expect(result.A).toBe("hello");
    expect(result.B).toBe("world");
    expect(result.C).toBe("plain");
  });

  it("skips comments and blank lines", () => {
    const result = parseSecretsFile("# comment\n\nFOO=bar\n# another\n");
    expect(result).toEqual({ FOO: "bar" });
  });

  it("maps OPNsense native download format (lowercase key/secret)", () => {
    const result = parseSecretsFile("key=abc123\nsecret=xyz789\n");
    expect(result.OPNSENSE_API_KEY).toBe("abc123");
    expect(result.OPNSENSE_API_SECRET).toBe("xyz789");
  });

  it("does not overwrite explicit OPNSENSE_API_KEY from lowercase key", () => {
    const result = parseSecretsFile(
      "key=fromdownload\nOPNSENSE_API_KEY=explicit\n"
    );
    expect(result.OPNSENSE_API_KEY).toBe("explicit");
  });

  it("ignores malformed lines", () => {
    const result = parseSecretsFile("nokeyequals\n=novalue\nFOO=bar");
    expect(result).toEqual({ FOO: "bar" });
  });

  it("returns empty object for empty input", () => {
    expect(parseSecretsFile("")).toEqual({});
  });
});

describe("expandTilde", () => {
  it("expands ~/ to home directory", () => {
    const result = expandTilde("~/secrets.env");
    expect(result).toBe(path.join(os.homedir(), "secrets.env"));
  });

  it("expands bare ~ to home directory", () => {
    expect(expandTilde("~")).toBe(os.homedir());
  });

  it("leaves absolute paths unchanged", () => {
    expect(expandTilde("/etc/mcp.env")).toBe("/etc/mcp.env");
  });

  it("leaves relative paths unchanged", () => {
    expect(expandTilde("./local.env")).toBe("./local.env");
  });
});

describe("loadSecretsFile", () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-opnsense-test-"));
    tmpFile = path.join(tmpDir, "secrets.env");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads file values into env when env is empty", () => {
    fs.writeFileSync(
      tmpFile,
      "OPNSENSE_URL=https://fw.example.com\nOPNSENSE_API_KEY=k\nOPNSENSE_API_SECRET=s\n"
    );
    const env: NodeJS.ProcessEnv = { MCP_SECRETS_FILE: tmpFile };
    loadSecretsFile(env);
    expect(env.OPNSENSE_URL).toBe("https://fw.example.com");
    expect(env.OPNSENSE_API_KEY).toBe("k");
    expect(env.OPNSENSE_API_SECRET).toBe("s");
  });

  it("process.env takes precedence over file values", () => {
    fs.writeFileSync(tmpFile, "OPNSENSE_API_KEY=file-key\n");
    const env: NodeJS.ProcessEnv = {
      MCP_SECRETS_FILE: tmpFile,
      OPNSENSE_API_KEY: "env-key",
    };
    loadSecretsFile(env);
    expect(env.OPNSENSE_API_KEY).toBe("env-key");
  });

  it("empty string env value is treated as unset and gets overwritten", () => {
    fs.writeFileSync(tmpFile, "OPNSENSE_URL=https://fw.example.com\n");
    const env: NodeJS.ProcessEnv = {
      MCP_SECRETS_FILE: tmpFile,
      OPNSENSE_URL: "",
    };
    loadSecretsFile(env);
    expect(env.OPNSENSE_URL).toBe("https://fw.example.com");
  });

  it("missing file does not throw", () => {
    const env: NodeJS.ProcessEnv = {
      MCP_SECRETS_FILE: path.join(tmpDir, "does-not-exist.env"),
    };
    expect(() => loadSecretsFile(env)).not.toThrow();
  });

  it("unset MCP_SECRETS_FILE is a no-op", () => {
    const env: NodeJS.ProcessEnv = { EXISTING: "keep" };
    loadSecretsFile(env);
    expect(env).toEqual({ EXISTING: "keep" });
  });

  it("loads OPNsense native download format", () => {
    fs.writeFileSync(tmpFile, "key=native-key\nsecret=native-secret\n");
    const env: NodeJS.ProcessEnv = { MCP_SECRETS_FILE: tmpFile };
    loadSecretsFile(env);
    expect(env.OPNSENSE_API_KEY).toBe("native-key");
    expect(env.OPNSENSE_API_SECRET).toBe("native-secret");
  });

  it("expands tilde in MCP_SECRETS_FILE path", () => {
    // Create a file in the real home dir with a unique name, then clean up
    const uniqueName = `.mcp-opnsense-test-${Date.now()}.env`;
    const realPath = path.join(os.homedir(), uniqueName);
    try {
      fs.writeFileSync(realPath, "OPNSENSE_URL=https://tilde.example.com\n");
      const env: NodeJS.ProcessEnv = { MCP_SECRETS_FILE: `~/${uniqueName}` };
      loadSecretsFile(env);
      expect(env.OPNSENSE_URL).toBe("https://tilde.example.com");
    } finally {
      fs.rmSync(realPath, { force: true });
    }
  });
});
