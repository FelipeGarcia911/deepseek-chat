export interface FrontendConfig {
  readonly apiBaseUrl: string;
}

export function parseFrontendConfig(environment: Readonly<Record<string, unknown>>): FrontendConfig {
  const value = environment.VITE_API_BASE_URL;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(
      "Invalid frontend configuration: VITE_API_BASE_URL is required. Set it in frontend/.env or the build environment."
    );
  }

  try {
    const input = value.trim();
    if (input.startsWith("/") && !input.startsWith("//") && !/[\s\\?#]/.test(input)) {
      return Object.freeze({ apiBaseUrl: input.replace(/\/+$/, "") });
    }
    const url = new URL(input);
    if (
      !/^https?:\/\//i.test(input) ||
      !url.hostname ||
      !["http:", "https:"].includes(url.protocol) ||
      /[\s\\?#]/.test(input) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error("Unsupported API base URL");
    }
    return Object.freeze({ apiBaseUrl: input.replace(/\/+$/, "") });
  } catch {
    throw new Error(
      "Invalid frontend configuration: VITE_API_BASE_URL must be an HTTP(S) or root-relative API base URL without credentials, whitespace, query or fragment."
    );
  }
}
