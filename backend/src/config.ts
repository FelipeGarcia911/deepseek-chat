import path from "node:path";

export enum NodeEnvironment {
  Development = "development",
  Test = "test",
  Production = "production",
}

export interface AppConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  readonly corsOrigins: readonly string[];
  readonly chatStoragePath: string;
}

export class ConfigurationError extends Error {
  constructor(issues: readonly string[]) {
    super(`Invalid platform configuration:\n- ${issues.join("\n- ")}\nCheck backend/.env or the process environment.`);
    this.name = "ConfigurationError";
  }
}

export function loadConfig(
  environment: Readonly<NodeJS.ProcessEnv>,
  backendDirectory = path.resolve(__dirname, "..")
): AppConfig {
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

  const storageValue = required("CHAT_STORAGE_PATH");
  if (storageValue && (/[\0\r\n]/.test(storageValue) || path.extname(storageValue).toLowerCase() !== ".json")) {
    issues.push("CHAT_STORAGE_PATH: must name a JSON file without null bytes or line breaks.");
  }

  if (issues.length) throw new ConfigurationError(issues);
  return Object.freeze({
    nodeEnv,
    port,
    corsOrigins: Object.freeze(corsOrigins),
    chatStoragePath: path.resolve(backendDirectory, storageValue),
  });
}
