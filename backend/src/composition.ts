import type { AppConfig } from "./config";
import { createApp } from "./app";
import { createDatabase } from "./db/database";
import { ConversationRepository, createUnitOfWork } from "./repositories/ConversationRepository";
import ConversationService from "./services/ConversationService";
import HealthService from "./services/HealthService";
import ChatRuntimeService, { unconfiguredModelResolver } from "./runtime/ChatRuntimeService";

export function createApplication(config: AppConfig) {
  const db = createDatabase(config.databaseUrl);
  const conversationService = new ConversationService({
    store: new ConversationRepository(db),
    transaction: createUnitOfWork(db),
  });
  const app = createApp(
    {
      conversationService,
      chatRuntime: new ChatRuntimeService({ conversations: conversationService, models: unconfiguredModelResolver }),
      healthService: new HealthService(db),
    },
    { nodeEnv: config.nodeEnv, corsOrigins: config.corsOrigins }
  );
  return { app, close: () => db.destroy() };
}
