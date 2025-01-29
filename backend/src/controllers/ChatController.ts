import { Request, Response } from "express";
import ChatService from "../services/ChatService";
import OllamaService from "../services/OllamaService";

class ChatController {
  async handleChatRequest(req: Request, res: Response): Promise<void> {
    try {
      const { chatId, message } = req.body;

      if (!chatId || !message) {
        res.status(400).json({ error: "chatId y message son requeridos." });
        return;
      }

      console.log(`🔹 Recibido mensaje en chat ${chatId}: ${message}`);

      // Guardar mensaje del usuario en el historial
      ChatService.saveMessage(chatId, "user", message);

      // Obtener historial del chat
      const chatHistory = ChatService.getChatHistory(chatId);

      // Enviar historial completo a Ollama
      const botResponse = await OllamaService.sendMessage(message);
      console.log("🚀 ~ ChatController ~ handleChatRequest ~ botResponse:", botResponse);

      // Guardar respuesta del bot
      ChatService.saveMessage(chatId, "bot", botResponse);

      res.json({ response: botResponse });
    } catch (error: any) {
      console.error("❌ Error en ChatController:", error.message);
      res.status(500).json({ error: "Error en el servidor." });
    }
  }
}

export default new ChatController();
