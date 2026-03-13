import axios, { type AxiosInstance } from "axios";
import https from "node:https";
import type { OPNsenseConfig } from "./types.js";
import { extractError } from "../utils/errors.js";

export class OPNsenseClient {
  private readonly http: AxiosInstance;

  constructor(private readonly config: OPNsenseConfig) {
    const baseURL = config.url.replace(/\/+$/, "") + "/api";

    this.http = axios.create({
      baseURL,
      timeout: config.timeout ?? 30000,
      auth: {
        username: config.apiKey,
        password: config.apiSecret,
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: config.verifySsl ?? true,
      }),
      headers: {
        Accept: "application/json",
      },
    });
  }

  async get<T>(path: string): Promise<T> {
    try {
      const response = await this.http.get<T>(path);
      return response.data;
    } catch (error: unknown) {
      throw extractError(error, `GET ${path}`);
    }
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    try {
      const response = await this.http.post<T>(path, data ?? {}, {
        headers: { "Content-Type": "application/json" },
      });
      return response.data;
    } catch (error: unknown) {
      throw extractError(error, `POST ${path}`);
    }
  }

  async delete<T>(path: string): Promise<T> {
    try {
      const response = await this.http.delete<T>(path);
      return response.data;
    } catch (error: unknown) {
      throw extractError(error, `DELETE ${path}`);
    }
  }

  static fromEnv(): OPNsenseClient {
    const url = process.env["OPNSENSE_URL"];
    const apiKey = process.env["OPNSENSE_API_KEY"];
    const apiSecret = process.env["OPNSENSE_API_SECRET"];

    if (!url) throw new Error("OPNSENSE_URL environment variable is required");
    if (!apiKey) throw new Error("OPNSENSE_API_KEY environment variable is required");
    if (!apiSecret) throw new Error("OPNSENSE_API_SECRET environment variable is required");

    const verifySsl = process.env["OPNSENSE_VERIFY_SSL"] !== "false";
    const timeout = parseInt(process.env["OPNSENSE_TIMEOUT"] ?? "30000", 10);

    return new OPNsenseClient({ url, apiKey, apiSecret, verifySsl, timeout });
  }
}
