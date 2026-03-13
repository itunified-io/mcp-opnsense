import { z } from "zod";
import type { OPNsenseClient } from "../client/opnsense-client.js";
import { UuidSchema } from "../utils/validation.js";

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
    name: "opnsense_acme_list_challenges",
    description: "List all configured ACME challenge/validation methods (DNS-01, HTTP-01, etc.)",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "opnsense_acme_add_challenge",
    description:
      "Add a DNS-01 challenge configuration for automated certificate validation. Run opnsense_acme_apply afterwards.",
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
          description: "Environment variables for the DNS provider (e.g. 'CF_Token=xxx CF_Account_ID=yyy')",
        },
        description: { type: "string", description: "Optional description" },
      },
      required: ["name", "dns_service"],
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
        const result = await client.get("/acme/accounts/search");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_add_account": {
        const parsed = AddAccountSchema.parse(args);
        const result = await client.post("/acme/accounts/add", {
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
        const result = await client.post(`/acme/accounts/del/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_list_challenges": {
        const result = await client.get("/acme/validations/search");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_add_challenge": {
        const parsed = AddChallengeSchema.parse(args);
        const result = await client.post("/acme/validations/add", {
          validation: {
            enabled: "1",
            name: parsed.name,
            dns_service: parsed.dns_service,
            dns_environment: parsed.dns_environment,
            description: parsed.description,
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_delete_challenge": {
        const { uuid } = DeleteChallengeSchema.parse(args);
        const result = await client.post(`/acme/validations/del/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_list_certs": {
        const result = await client.get("/acme/certificates/search");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_create_cert": {
        const parsed = CreateCertSchema.parse(args);
        const result = await client.post("/acme/certificates/add", {
          certificate: {
            enabled: "1",
            name: parsed.name,
            description: parsed.description,
            altNames: parsed.alt_names,
            account: parsed.account_uuid,
            validationMethod: parsed.validation_uuid,
            keyLength: parsed.key_length,
            autoRenewal: parsed.auto_renewal ? "1" : "0",
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_delete_cert": {
        const { uuid } = DeleteCertSchema.parse(args);
        const result = await client.post(`/acme/certificates/del/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_renew_cert": {
        const { uuid } = RenewCertSchema.parse(args);
        const result = await client.post(`/acme/certificates/sign/${uuid}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "opnsense_acme_apply": {
        const result = await client.post("/acme/service/reconfigure");
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
