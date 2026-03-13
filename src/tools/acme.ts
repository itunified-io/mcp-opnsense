import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";
import { UuidSchema } from "../utils/validation.js";

// ---------------------------------------------------------------------------
// Key length mapping: user-facing values → OPNsense API values
// ---------------------------------------------------------------------------

const KEY_LENGTH_MAP: Record<string, string> = {
  "2048": "2048",
  "4096": "4096",
  ec256: "key_ec256",
  ec384: "key_ec384",
};

// ---------------------------------------------------------------------------
// Cloudflare DNS credential fields (dns_cf)
// ---------------------------------------------------------------------------

const CloudflareDnsFields = z.object({
  dns_cf_token: z.string().optional().describe("Cloudflare API Token (recommended)"),
  dns_cf_account_id: z.string().optional().describe("Cloudflare Account ID (used with API Token)"),
  dns_cf_key: z.string().optional().describe("Cloudflare Global API Key (legacy)"),
  dns_cf_email: z.string().optional().describe("Cloudflare account email (used with Global API Key)"),
  dns_cf_zone_id: z.string().optional().describe("Cloudflare Zone ID (optional, speeds up DNS operations)"),
});

// ---------------------------------------------------------------------------
// Zod schemas for input validation
// ---------------------------------------------------------------------------

const AddChallengeSchema = z.object({
  name: z.string().min(1, "Challenge name is required"),
  dns_service: z.enum([
    "dns_cf",
    "dns_aws",
    "dns_gcloud",
    "dns_dgon",
    "dns_he",
    "dns_linode",
    "dns_nsone",
    "dns_ovh",
    "dns_pdns",
  ], { message: "Unsupported DNS provider" }),
  dns_environment: z.string().optional().default(""),
  description: z.string().optional().default(""),
  // Cloudflare-specific credential fields
  dns_cf_token: z.string().optional(),
  dns_cf_account_id: z.string().optional(),
  dns_cf_key: z.string().optional(),
  dns_cf_email: z.string().optional(),
  dns_cf_zone_id: z.string().optional(),
});

const UpdateChallengeSchema = z.object({
  uuid: UuidSchema,
  name: z.string().optional(),
  dns_service: z.enum([
    "dns_cf",
    "dns_aws",
    "dns_gcloud",
    "dns_dgon",
    "dns_he",
    "dns_linode",
    "dns_nsone",
    "dns_ovh",
    "dns_pdns",
  ], { message: "Unsupported DNS provider" }).optional(),
  dns_environment: z.string().optional(),
  description: z.string().optional(),
  // Cloudflare-specific credential fields
  dns_cf_token: z.string().optional(),
  dns_cf_account_id: z.string().optional(),
  dns_cf_key: z.string().optional(),
  dns_cf_email: z.string().optional(),
  dns_cf_zone_id: z.string().optional(),
});

const CreateCertSchema = z.object({
  name: z.string().min(1, "Certificate name is required"),
  description: z.string().optional().default(""),
  alt_names: z.string().min(1, "At least one domain (SAN) is required"),
  account_uuid: UuidSchema.describe("UUID of the ACME account to use"),
  validation_uuid: UuidSchema.describe("UUID of the challenge/validation to use"),
  key_length: z.enum(["2048", "4096", "ec256", "ec384"]).optional().default("ec256"),
  auto_renewal: z.boolean().optional().default(true),
});

const RenewCertSchema = z.object({
  uuid: UuidSchema,
});

const DeleteChallengeSchema = z.object({
  uuid: UuidSchema,
});

const DeleteCertSchema = z.object({
  uuid: UuidSchema,
});

const AddAccountSchema = z.object({
  name: z.string().min(1, "Account name is required"),
  email: z.string().email("Valid email address is required"),
  ca: z.enum([
    "letsencrypt",
    "letsencrypt-staging",
    "zerossl",
    "buypass",
    "buypass-test",
    "sslcom",
    "google",
    "googletest",
  ], { message: "Unsupported certificate authority" }).optional().default("letsencrypt"),
});

const DeleteAccountSchema = z.object({
  uuid: UuidSchema,
});

const RegisterAccountSchema = z.object({
  uuid: UuidSchema,
});

const AcmeSettingsSchema = z.object({
  enabled: z.enum(["0", "1"]).optional(),
  environment: z.enum(["prod", "stg"]).optional(),
  autoRenewal: z.enum(["0", "1"]).optional(),
  logLevel: z.enum(["normal", "extended", "debug"]).optional(),
});

// ---------------------------------------------------------------------------
// Helper: extract provider credential fields from parsed args
// ---------------------------------------------------------------------------

function extractProviderFields(
  parsed: Record<string, unknown>,
  dns_service: string,
): Record<string, string> {
  const fields: Record<string, string> = {};
  if (dns_service === "dns_cf") {
    if (parsed.dns_cf_token) fields.dns_cf_token = String(parsed.dns_cf_token);
    if (parsed.dns_cf_account_id) fields.dns_cf_account_id = String(parsed.dns_cf_account_id);
    if (parsed.dns_cf_key) fields.dns_cf_key = String(parsed.dns_cf_key);
    if (parsed.dns_cf_email) fields.dns_cf_email = String(parsed.dns_cf_email);
    if (parsed.dns_cf_zone_id) fields.dns_cf_zone_id = String(parsed.dns_cf_zone_id);
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Tool definitions (for ListTools)
// ---------------------------------------------------------------------------

export const acmeToolDefinitions = [
  {
    name: "opnsense_acme_list_accounts",
    description: "List all ACME accounts (Let's Encrypt, ZeroSSL, etc.) configured in the os-acme-client plugin",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_acme_add_account",
    description:
      "Register a new ACME account with a certificate authority (Let's Encrypt, ZeroSSL, etc.). Run opnsense_acme_apply afterwards.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Account name (e.g. 'Let\\'s Encrypt Production')" },
        email: { type: "string", description: "Contact email address for the account" },
        ca: {
          type: "string",
          enum: ["letsencrypt", "letsencrypt-staging", "zerossl", "buypass", "buypass-test", "sslcom", "google", "googletest"],
          description: "Certificate authority (default: letsencrypt)",
        },
      },
      required: ["name", "email"],
    },
  },
  {
    name: "opnsense_acme_delete_account",
    description: "Delete an ACME account by UUID. Run opnsense_acme_apply afterwards.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the account to delete" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_acme_register_account",
    description: "Trigger registration of an ACME account with its certificate authority. Use after adding an account to verify it registers successfully.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the account to register" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_acme_list_challenges",
    description: "List all configured ACME challenge/validation methods (DNS-01, HTTP-01, etc.)",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_acme_add_challenge",
    description:
      "Add a DNS-01 challenge configuration for automated certificate validation. For Cloudflare, use the dedicated dns_cf_* fields instead of dns_environment. Run opnsense_acme_apply afterwards.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Name for this challenge (e.g. 'Cloudflare DNS')" },
        dns_service: {
          type: "string",
          enum: ["dns_cf", "dns_aws", "dns_gcloud", "dns_dgon", "dns_he", "dns_linode", "dns_nsone", "dns_ovh", "dns_pdns"],
          description: "DNS provider service ID (e.g. 'dns_cf' for Cloudflare)",
        },
        dns_environment: {
          type: "string",
          description: "Environment variables for the DNS provider (for non-Cloudflare providers or custom env vars)",
        },
        description: { type: "string", description: "Optional description" },
        dns_cf_token: { type: "string", description: "Cloudflare API Token (recommended over Global API Key)" },
        dns_cf_account_id: { type: "string", description: "Cloudflare Account ID (used with API Token)" },
        dns_cf_key: { type: "string", description: "Cloudflare Global API Key (legacy, use dns_cf_token instead)" },
        dns_cf_email: { type: "string", description: "Cloudflare account email (used with Global API Key)" },
        dns_cf_zone_id: { type: "string", description: "Cloudflare Zone ID (optional, speeds up DNS operations)" },
      },
      required: ["name", "dns_service"],
    },
  },
  {
    name: "opnsense_acme_update_challenge",
    description:
      "Update an existing ACME challenge/validation by UUID. Use to change credentials or settings. Run opnsense_acme_apply afterwards.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the challenge to update" },
        name: { type: "string", description: "Updated name" },
        dns_service: {
          type: "string",
          enum: ["dns_cf", "dns_aws", "dns_gcloud", "dns_dgon", "dns_he", "dns_linode", "dns_nsone", "dns_ovh", "dns_pdns"],
          description: "DNS provider service ID",
        },
        dns_environment: { type: "string", description: "Environment variables" },
        description: { type: "string", description: "Updated description" },
        dns_cf_token: { type: "string", description: "Cloudflare API Token" },
        dns_cf_account_id: { type: "string", description: "Cloudflare Account ID" },
        dns_cf_key: { type: "string", description: "Cloudflare Global API Key" },
        dns_cf_email: { type: "string", description: "Cloudflare account email" },
        dns_cf_zone_id: { type: "string", description: "Cloudflare Zone ID" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_acme_delete_challenge",
    description: "Delete an ACME challenge/validation method by UUID. Run opnsense_acme_apply afterwards.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the challenge to delete" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_acme_list_certs",
    description: "List all ACME certificates and their status (issued, pending, expired)",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_acme_create_cert",
    description:
      "Create a new ACME certificate request. Requires an account and challenge to be configured first. Run opnsense_acme_apply afterwards.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Certificate name (e.g. 'fw.example.com')" },
        description: { type: "string", description: "Optional description" },
        alt_names: {
          type: "string",
          description: "Comma-separated Subject Alternative Names (e.g. 'fw.example.com,*.itunified.io')",
        },
        account_uuid: { type: "string", description: "UUID of the ACME account" },
        validation_uuid: { type: "string", description: "UUID of the challenge/validation method" },
        key_length: {
          type: "string",
          enum: ["2048", "4096", "ec256", "ec384"],
          description: "Key type and length (default: ec256)",
        },
        auto_renewal: {
          type: "boolean",
          description: "Enable automatic renewal (default: true)",
        },
      },
      required: ["name", "alt_names", "account_uuid", "validation_uuid"],
    },
  },
  {
    name: "opnsense_acme_delete_cert",
    description: "Delete an ACME certificate by UUID. Run opnsense_acme_apply afterwards.",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the certificate to delete" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_acme_renew_cert",
    description: "Trigger immediate renewal/signing of an ACME certificate by UUID",
    inputSchema: {
      type: "object" as const,
      properties: {
        uuid: { type: "string", description: "UUID of the certificate to renew" },
      },
      required: ["uuid"],
    },
  },
  {
    name: "opnsense_acme_settings",
    description: "Get or update ACME service settings (enable/disable, environment, auto-renewal, log level). When called with no parameters, returns current settings. Run opnsense_acme_apply afterwards when updating.",
    inputSchema: {
      type: "object" as const,
      properties: {
        enabled: { type: "string", enum: ["0", "1"], description: "Enable (1) or disable (0) the ACME service" },
        environment: { type: "string", enum: ["prod", "stg"], description: "ACME environment: prod (production) or stg (staging)" },
        autoRenewal: { type: "string", enum: ["0", "1"], description: "Enable (1) or disable (0) automatic certificate renewal" },
        logLevel: { type: "string", enum: ["normal", "extended", "debug"], description: "Log verbosity level" },
      },
    },
  },
  {
    name: "opnsense_acme_apply",
    description: "Apply pending ACME configuration changes (reconfigure service)",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function handleAcmeTool(
  name: string,
  args: Record<string, unknown>,
  client: OPNsenseClient,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    switch (name) {
      case "opnsense_acme_list_accounts": {
        const result = await client.get("/acmeclient/accounts/search");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_add_account": {
        const parsed = AddAccountSchema.parse(args);
        const result = await client.post("/acmeclient/accounts/add", {
          account: {
            enabled: "1",
            name: parsed.name,
            email: parsed.email,
            ca: parsed.ca,
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_delete_account": {
        const { uuid } = DeleteAccountSchema.parse(args);
        const result = await client.post(`/acmeclient/accounts/del/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_register_account": {
        const { uuid } = RegisterAccountSchema.parse(args);
        const result = await client.post(`/acmeclient/accounts/register/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_list_challenges": {
        const result = await client.get("/acmeclient/validations/search");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_add_challenge": {
        const parsed = AddChallengeSchema.parse(args);
        const providerFields = extractProviderFields(parsed, parsed.dns_service);
        const result = await client.post("/acmeclient/validations/add", {
          validation: {
            enabled: "1",
            name: parsed.name,
            dns_service: parsed.dns_service,
            dns_environment: parsed.dns_environment,
            description: parsed.description,
            ...providerFields,
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_update_challenge": {
        const parsed = UpdateChallengeSchema.parse(args);
        const { uuid, ...rest } = parsed;
        const dns_service = rest.dns_service ?? "dns_cf";
        const providerFields = extractProviderFields(rest, dns_service);
        const validation: Record<string, string> = {};
        if (rest.name !== undefined) validation.name = rest.name;
        if (rest.dns_service !== undefined) validation.dns_service = rest.dns_service;
        if (rest.dns_environment !== undefined) validation.dns_environment = rest.dns_environment;
        if (rest.description !== undefined) validation.description = rest.description;
        Object.assign(validation, providerFields);

        // IMPORTANT: OPNsense ValidationsController uses updateAction(), NOT setAction()
        // The /set/ endpoint silently returns success without persisting data (#25)
        const result = await client.post(`/acmeclient/validations/update/${uuid}`, {
          validation,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_delete_challenge": {
        const { uuid } = DeleteChallengeSchema.parse(args);
        const result = await client.post(`/acmeclient/validations/del/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_list_certs": {
        const result = await client.get("/acmeclient/certificates/search");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_create_cert": {
        const parsed = CreateCertSchema.parse(args);
        // Map user-facing key_length to OPNsense API value (#23)
        const apiKeyLength = KEY_LENGTH_MAP[parsed.key_length] ?? parsed.key_length;
        const result = await client.post("/acmeclient/certificates/add", {
          certificate: {
            enabled: "1",
            name: parsed.name,
            description: parsed.description,
            altNames: parsed.alt_names,
            account: parsed.account_uuid,
            validationMethod: parsed.validation_uuid,
            keyLength: apiKeyLength,
            autoRenewal: parsed.auto_renewal ? "1" : "0",
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_delete_cert": {
        const { uuid } = DeleteCertSchema.parse(args);
        const result = await client.post(`/acmeclient/certificates/del/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_renew_cert": {
        const { uuid } = RenewCertSchema.parse(args);
        const result = await client.post(`/acmeclient/certificates/sign/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_settings": {
        const parsed = AcmeSettingsSchema.parse(args);
        const hasUpdates = parsed.enabled !== undefined ||
          parsed.environment !== undefined ||
          parsed.autoRenewal !== undefined ||
          parsed.logLevel !== undefined;

        if (!hasUpdates) {
          // GET current settings
          const result = await client.get("/acmeclient/settings/get");
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        // Update settings with correct wrapper key (#26)
        const settings: Record<string, string> = {};
        if (parsed.enabled !== undefined) settings.enabled = parsed.enabled;
        if (parsed.environment !== undefined) settings.environment = parsed.environment;
        if (parsed.autoRenewal !== undefined) settings.autoRenewal = parsed.autoRenewal;
        if (parsed.logLevel !== undefined) settings.logLevel = parsed.logLevel;

        const result = await client.post("/acmeclient/settings/set", {
          acmeclient: { settings },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_apply": {
        const result = await client.post("/acmeclient/service/reconfigure");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown ACME tool: ${name}` }],
        };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${message}` }],
    };
  }
}
