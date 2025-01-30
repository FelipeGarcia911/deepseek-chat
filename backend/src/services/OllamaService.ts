import axios from "axios";

interface OllamaMessage {
  role: string;
  content: string;
}
class OllamaService {
  private readonly OLLAMA_API_URL = "http://localhost:11434/api/chat";
  private readonly model = "deepseek-r1:7b";

  private getInitialPrompt() {
    return {
      role: "system",
      content: "Eres un asistente de IA. Responde de manera clara y concisa.",
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
        throw new Error("El historial del chat está vacío.");
      }

      if (this.isFirstMessage(chatHistory)) {
        chatHistory.unshift(this.getInitialPrompt());
      }

      const response = await axios.post(this.OLLAMA_API_URL, {
        model: this.model,
        messages: chatHistory,
        stream: false,
      });

      if (!response.data || !response.data.message || !response.data.message.content) {
        throw new Error("Ollama no devolvió una respuesta válida.");
      }

      return this.cleanResponse(response.data.message.content);
    } catch (error: any) {
      console.error("❌ Error al conectar con Ollama:", error.message);
      throw new Error("Error en la comunicación con Ollama.");
    }
  }

  async sendSimpleMessage(prompt: string) {
    try {
      const response = await axios.post(this.OLLAMA_API_URL, {
        model: this.model,
        prompt: prompt,
        stream: false,
      });

      if (!response.data || !response.data.response) {
        throw new Error("Ollama no devolvió una respuesta válida.");
      }

      return response.data.response;
    } catch (error: any) {
      console.error("❌ Error al conectar con Ollama:", error.message);
      throw new Error("Error en la comunicación con Ollama.");
    }
  }
}

export default new OllamaService();
