import axios from "axios";

export class OPNsenseApiError extends Error {
  readonly status: number | undefined;
  readonly endpoint: string;
  readonly details: string | undefined;

  constructor(
    message: string,
    endpoint: string,
    status?: number,
    details?: string,
  ) {
    super(message);
    this.name = "OPNsenseApiError";
    this.endpoint = endpoint;
    this.status = status;
    this.details = details;
  }
}

function sanitizeDetails(data: unknown): string | undefined {
  if (data == null) return undefined;
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    return JSON.stringify(data);
  }
  return String(data);
}

export function extractError(
  error: unknown,
  endpoint: string,
): OPNsenseApiError {
  if (axios.isAxiosError(error)) {
    const response = error.response;

    if (response) {
      const data = response.data as Record<string, unknown> | undefined;

      const message =
        typeof data?.message === "string"
          ? data.message
          : typeof data?.errorMessage === "string"
            ? data.errorMessage
            : `OPNsense API error: ${response.status} ${response.statusText}`;

      const validations = data?.validations;
      const details = validations
        ? sanitizeDetails(validations)
        : sanitizeDetails(data);

      return new OPNsenseApiError(message, endpoint, response.status, details);
    }

    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.code === "ETIMEDOUT") {
      return new OPNsenseApiError(
        `Network error: ${error.code} — unable to reach OPNsense API`,
        endpoint,
      );
    }

    return new OPNsenseApiError(
      error.message || "Unknown network error",
      endpoint,
    );
  }

  if (error instanceof Error) {
    return new OPNsenseApiError(error.message, endpoint);
  }

  return new OPNsenseApiError("Unknown error occurred", endpoint);
}
