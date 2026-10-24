import path from "node:path";
import { createApp } from "./app";
import ChatService from "./services/ChatService";
import OllamaService from "./services/OllamaService";

export async function createApplication() {
  const storagePath = path.join(__dirname, "services", process.env.LOGS_PATH || "../logs/chats.json");
  const chatService = new ChatService(storagePath);
  const ollamaService = new OllamaService(process.env.OLLAMA_API_URL || "", process.env.MODEL_NAME || "");

  await chatService.initialize();
  return createApp({ chatService, ollamaService });
}
