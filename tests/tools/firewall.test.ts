import { describe, it, expect, vi } from "vitest";
import {
  firewallToolDefinitions,
  handleFirewallTool,
  extractSelected,
} from "../../src/tools/firewall.js";
import type { OPNsenseClient } from "../../src/client/opnsense-client.js";

function mockClient(overrides: Partial<OPNsenseClient> = {}): OPNsenseClient {
  return {
    get: vi.fn().mockResolvedValue({ rows: [] }),
    post: vi.fn().mockResolvedValue({ result: "saved" }),
    delete: vi.fn().mockResolvedValue({ status: "ok" }),
    ...overrides,
  } as unknown as OPNsenseClient;
}

// ---------------------------------------------------------------------------
// extractSelected helper
// ---------------------------------------------------------------------------

describe("extractSelected", () => {
  it("returns string values as-is", () => {
    expect(extractSelected("pass")).toBe("pass");
    expect(extractSelected("1")).toBe("1");
    expect(extractSelected("")).toBe("");
  });

  it("extracts selected key from multi-select with numeric selected", () => {
    const field = {
      pass: { value: "Pass", selected: 1 },
      block: { value: "Block", selected: 0 },
      reject: { value: "Reject", selected: 0 },
    };
    expect(extractSelected(field)).toBe("pass");
  });

  it("extracts selected key from multi-select with string selected", () => {
    const field = {
      in: { value: "In", selected: "1" },
      out: { value: "Out", selected: "0" },
    };
    expect(extractSelected(field)).toBe("in");
  });

  it("returns comma-joined keys when multiple are selected", () => {
    const field = {
      lan: { value: "LAN", selected: 1 },
      wan: { value: "WAN", selected: 1 },
      opt1: { value: "OPT1", selected: 0 },
    };
    expect(extractSelected(field)).toBe("lan,wan");
  });

  it("returns undefined for non-multi-select objects", () => {
    // An object without {selected} children
    const field = { some: "value", other: 42 };
    expect(extractSelected(field)).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(extractSelected(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(extractSelected(undefined)).toBeUndefined();
  });

  it("returns undefined for numbers", () => {
    expect(extractSelected(42)).toBeUndefined();
  });

  it("returns undefined for arrays", () => {
    expect(extractSelected(["a", "b"])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

describe("firewallToolDefinitions", () => {
  it("all tools have opnsense_fw_ prefix", () => {
    for (const tool of firewallToolDefinitions) {
      expect(tool.name).toMatch(/^opnsense_fw_/);
    }
  });

  it("all tools have descriptions", () => {
    for (const tool of firewallToolDefinitions) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });
});

// ---------------------------------------------------------------------------
// opnsense_fw_reorder_rules
// ---------------------------------------------------------------------------

describe("handleFirewallTool — opnsense_fw_reorder_rules", () => {
  it("extracts core fields from getRule and sends clean setRule payload", async () => {
    const getResponse = {
      rule: {
        enabled: {
          "1": { value: "Enabled", selected: 1 },
          "0": { value: "Disabled", selected: 0 },
        },
        action: {
          pass: { value: "Pass", selected: 0 },
          block: { value: "Block", selected: 1 },
          reject: { value: "Reject", selected: 0 },
        },
        direction: {
          in: { value: "In", selected: 1 },
          out: { value: "Out", selected: 0 },
        },
        interface: {
          lan: { value: "LAN", selected: 1 },
          wan: { value: "WAN", selected: 0 },
        },
        ipprotocol: {
          inet: { value: "IPv4", selected: 1 },
          inet6: { value: "IPv6", selected: 0 },
        },
        protocol: {
          any: { value: "any", selected: 1 },
          TCP: { value: "TCP", selected: 0 },
        },
        source_net: "zone_iot",
        source_not: {
          "0": { value: "No", selected: 1 },
          "1": { value: "Yes", selected: 0 },
        },
        source_port: "",
        destination_net: "10.10.0.0/24",
        destination_not: {
          "0": { value: "No", selected: 1 },
          "1": { value: "Yes", selected: 0 },
        },
        destination_port: "",
        log: {
          "0": { value: "No", selected: 1 },
          "1": { value: "Yes", selected: 0 },
        },
        description: "IoT → LAN blocked (isolation)",
        sequence: "1",
        // Extra fields that getRule returns but setRule should NOT receive:
        gateway: { "": { value: "default", selected: 1 } },
        categories: {},
        quick: { "1": { value: "Yes", selected: 1 } },
      },
    };

    const postFn = vi.fn().mockResolvedValue({ result: "saved" });
    const client = mockClient({
      get: vi.fn().mockResolvedValue(getResponse),
      post: postFn,
    });

    const result = await handleFirewallTool(
      "opnsense_fw_reorder_rules",
      { uuid: "adc89225-6b44-467b-87c8-54702132b2f1", sequence: 5 },
      client,
    );

    expect(result.content[0].text).toContain("saved");

    // Verify the POST payload has clean, flat values
    const postCall = postFn.mock.calls[0];
    expect(postCall[0]).toBe(
      "/firewall/filter/setRule/adc89225-6b44-467b-87c8-54702132b2f1",
    );
    const payload = postCall[1].rule;
    expect(payload.enabled).toBe("1");
    expect(payload.action).toBe("block");
    expect(payload.direction).toBe("in");
    expect(payload.interface).toBe("lan");
    expect(payload.ipprotocol).toBe("inet");
    expect(payload.protocol).toBe("any");
    expect(payload.source_net).toBe("zone_iot");
    expect(payload.source_not).toBe("0");
    expect(payload.destination_net).toBe("10.10.0.0/24");
    expect(payload.destination_not).toBe("0");
    expect(payload.log).toBe("0");
    expect(payload.description).toBe("IoT → LAN blocked (isolation)");
    expect(payload.sequence).toBe("5");

    // Verify extra fields (gateway, categories, quick) are NOT sent
    expect(payload.gateway).toBeUndefined();
    expect(payload.categories).toBeUndefined();
    expect(payload.quick).toBeUndefined();
  });

  it("returns not-found message for missing rule", async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ rule: null }),
    });

    const result = await handleFirewallTool(
      "opnsense_fw_reorder_rules",
      { uuid: "00000000-0000-0000-0000-000000000000", sequence: 5 },
      client,
    );

    expect(result.content[0].text).toContain("not found");
  });

  it("uses defaults when getRule fields are missing", async () => {
    const postFn = vi.fn().mockResolvedValue({ result: "saved" });
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ rule: {} }),
      post: postFn,
    });

    await handleFirewallTool(
      "opnsense_fw_reorder_rules",
      { uuid: "11111111-1111-1111-1111-111111111111", sequence: 10 },
      client,
    );

    const payload = postFn.mock.calls[0][1].rule;
    expect(payload.enabled).toBe("1");
    expect(payload.action).toBe("pass");
    expect(payload.direction).toBe("in");
    expect(payload.protocol).toBe("any");
    expect(payload.source_net).toBe("any");
    expect(payload.destination_net).toBe("any");
    expect(payload.sequence).toBe("10");
  });
});
