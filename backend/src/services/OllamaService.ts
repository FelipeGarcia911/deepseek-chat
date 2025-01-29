import axios from "axios";

class OllamaService {
  private readonly OLLAMA_API_URL = "http://localhost:11434/api/generate";

  async sendMessageToOllama(chatHistory: { role: string; content: string }[]) {
    try {
      const response = await axios.post(this.OLLAMA_API_URL, {
        model: "deepseek-r1:7b",
        messages: chatHistory,
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

  async sendMessage(prompt: string) {
    try {
      const response = await axios.post(this.OLLAMA_API_URL, {
        model: "deepseek-r1:7b",
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
