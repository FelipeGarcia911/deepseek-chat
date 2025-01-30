import { Request, Response } from "express";
import ChatService from "../services/ChatService";
import OllamaService from "../services/OllamaService";

class ChatController {
  getChats(req: Request, res: Response) {
    res.json(ChatService.getChats());
  }

  createChat(req: Request, res: Response) {
    const { title } = req.body;
    if (!title) res.status(400).json({ error: "El título es obligatorio." });

    const newChat = ChatService.createChat(title);
    res.json(newChat);
  }

  getChatHistory(req: Request, res: Response) {
    const { chatId } = req.params;
    res.json(ChatService.getChatHistory(chatId));
  }

  async sendMessage(req: Request, res: Response) {
    try {
      const { chatId, message } = req.body;

      if (!chatId || !message) {
        res.status(400).json({ error: "chatId y message son requeridos." });
        return;
      }

      console.log(`🔹 Recibido mensaje en chat ${chatId}: ${message}`);

      ChatService.saveMessage(chatId, "user", message);

      const chatHistory = ChatService.getChatHistory(chatId).map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: msg.text,
      }));

      const botResponse = await OllamaService.sendMessageWithHistory(chatHistory);
      console.log("🚀 ~ ChatController ~ sendMessage ~ botResponse:", botResponse);

      ChatService.saveMessage(chatId, "bot", botResponse);

      res.json({ response: botResponse });
    } catch (error) {
      console.error("❌ Error en ChatController:", error);
      res.status(500).json({ error: "Error en el servidor." });
    }
  }
}

export default new ChatController();
