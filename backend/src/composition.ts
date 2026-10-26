import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { AppConfig } from "./config";
import { createApp } from "./app";
import ConversationService from "./services/ConversationService";

export async function createApplication(config: AppConfig) {
  await mkdir(path.dirname(config.chatStoragePath), { recursive: true });
  const conversationService = new ConversationService(config.chatStoragePath);
  await conversationService.initialize();
  return createApp({ conversationService }, { nodeEnv: config.nodeEnv, corsOrigins: config.corsOrigins });
}
