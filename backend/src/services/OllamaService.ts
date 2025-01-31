import axios from "axios";
import dotenv from "dotenv";

dotenv.config(); // ✅ Ensure env variables are loaded

interface OllamaMessage {
  role: string;
  content: string;
}

class OllamaService {
  private readonly OLLAMA_API_URL: string;
  private readonly MODEL_NAME: string;

  constructor(apiUrl?: string, modelName?: string) {
    this.OLLAMA_API_URL = apiUrl || process.env.OLLAMA_API_URL || "";
    this.MODEL_NAME = modelName || process.env.MODEL_NAME || "";

    if (!this.OLLAMA_API_URL || !this.MODEL_NAME) {
      throw new Error("OLLAMA_API_URL and MODEL_NAME are required environment variables.");
    }
  }

  private getInitialPrompt() {
    return {
      role: "system",
      content: `You are a friendly and knowledgeable AI assistant. Your goal is to provide helpful, clear, and concise answers to any question the user asks.`,
    };
  }

  private cleanResponse(response: string): string {
    return response.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  }

  private isFirstMessage(chatHistory: OllamaMessage[]) {
    return chatHistory.length === 1 && chatHistory[0].role === "user";
  }

  async sendMessageWithHistory(chatHistory: OllamaMessage[]) {
    try {
      if (!chatHistory || chatHistory.length === 0) {
        throw new Error("Chat history cannot be empty.");
      }

      if (this.isFirstMessage(chatHistory)) {
        chatHistory.unshift(this.getInitialPrompt());
      }

      const response = await axios.post(this.OLLAMA_API_URL, {
        model: this.MODEL_NAME,
        messages: chatHistory,
        stream: false,
      });

      if (!response.data?.message?.content) {
        throw new Error("Ollama did not return a valid response.");
      }

      return this.cleanResponse(response.data.message.content);
    } catch (error: any) {
      console.error("❌ Error connecting to Ollama:", error.message);
      throw new Error("Error communicating with Ollama.");
    }
  }

  async sendSimpleMessage(prompt: string) {
    try {
      const response = await axios.post(this.OLLAMA_API_URL, {
        model: this.MODEL_NAME,
        prompt: prompt,
        stream: false,
      });

      if (!response.data?.response) {
        throw new Error("Ollama did not return a valid response.");
      }

      return response.data.response;
    } catch (error: any) {
      console.error("❌ Error connecting to Ollama:", error.message);
      throw new Error("Error communicating with Ollama.");
    }
  }
}

export default new OllamaService();
