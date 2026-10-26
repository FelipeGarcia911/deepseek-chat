import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { AppConfig } from "./config";
import { createApp } from "./app";
import ChatService from "./services/ChatService";

export async function createApplication(config: AppConfig) {
  await mkdir(path.dirname(config.chatStoragePath), { recursive: true });
  const chatService = new ChatService(config.chatStoragePath);
  await chatService.initialize();
  return createApp({ chatService }, { nodeEnv: config.nodeEnv, corsOrigins: config.corsOrigins });
}
