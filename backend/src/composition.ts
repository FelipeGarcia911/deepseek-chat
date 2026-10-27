import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { AppConfig } from "./config";
import { createApp } from "./app";
import { createDatabase } from "./db/database";
import ConversationService from "./services/ConversationService";
import HealthService from "./services/HealthService";

export async function createApplication(config: AppConfig) {
  await mkdir(path.dirname(config.chatStoragePath), { recursive: true });
  const conversationService = new ConversationService(config.chatStoragePath);
  await conversationService.initialize();
  const db = createDatabase(config.databaseUrl);
  const app = createApp(
    { conversationService, healthService: new HealthService(db) },
    { nodeEnv: config.nodeEnv, corsOrigins: config.corsOrigins }
  );
  return { app, close: () => db.destroy() };
}
