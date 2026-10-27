export enum NodeEnvironment {
  Development = "development",
  Test = "test",
  Production = "production",
}

export interface AppConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  readonly corsOrigins: readonly string[];
  readonly databaseUrl: string;
}

export class ConfigurationError extends Error {
  constructor(issues: readonly string[]) {
    super(`Invalid platform configuration:\n- ${issues.join("\n- ")}\nCheck backend/.env or the process environment.`);
    this.name = "ConfigurationError";
  }
}

export function isDatabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname) && url.pathname.length > 1;
  } catch {
    return false;
  }
}

export function loadConfig(environment: Readonly<NodeJS.ProcessEnv>): AppConfig {
  const issues: string[] = [];
  const required = (name: string) => {
    const value = environment[name]?.trim() || "";
    if (!value) issues.push(`${name}: required; provide a non-empty value.`);
    return value;
  };

  const nodeEnv = required("NODE_ENV") as NodeEnvironment;
  if (nodeEnv && !Object.values(NodeEnvironment).includes(nodeEnv)) {
    issues.push("NODE_ENV: must be development, test or production.");
  }

  const portValue = required("PORT");
  const port = Number(portValue);
  if (portValue && (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535)) {
    issues.push("PORT: must be an integer from 1 to 65535.");
  }

  const originValue = required("CORS_ORIGINS");
  const corsOrigins: string[] = [];
  if (originValue) {
    try {
      for (const entry of originValue.split(",")) {
        const input = entry.trim();
        const url = new URL(input);
        if (
          !/^https?:\/\/[^/\\?#\s]+\/?$/i.test(input) ||
          input.includes("*") ||
          !url.hostname ||
          /[\s\\?#]/.test(input) ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        ) {
          throw new Error("Unsupported origin");
        }
        if (!corsOrigins.includes(url.origin)) corsOrigins.push(url.origin);
      }
    } catch {
      issues.push(
        "CORS_ORIGINS: use comma-separated HTTP(S) origins without credentials, paths, query, fragment or wildcards."
      );
    }
  }

  const databaseUrl = required("DATABASE_URL");
  if (databaseUrl && !isDatabaseUrl(databaseUrl)) {
    issues.push("DATABASE_URL: must be a postgres:// or postgresql:// URL with a host and database name.");
  }

  if (issues.length) throw new ConfigurationError(issues);
  return Object.freeze({
    nodeEnv,
    port,
    corsOrigins: Object.freeze(corsOrigins),
    databaseUrl,
  });
}
