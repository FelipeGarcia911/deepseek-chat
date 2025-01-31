import { Request, Response } from "express";
import ChatService from "../services/ChatService";
import OllamaService from "../services/OllamaService";

class ChatController {
  async getChats(req: Request, res: Response): Promise<void> {
    try {
      const chats = await ChatService.getChats();
      res.json(chats);
    } catch (error) {
      console.error("❌ Error retrieving chats:", error);
      res.status(500).json({ error: "Failed to fetch chats." });
    }
  }

  async createChat(req: Request, res: Response): Promise<void> {
    try {
      const { title } = req.body;
      if (!title) {
        res.status(400).json({ error: "Chat title is required." });
        return;
      }

      const newChat = await ChatService.createChat(title);
      res.status(201).json(newChat);
    } catch (error) {
      console.error("❌ Error creating chat:", error);
      res.status(500).json({ error: "Failed to create chat." });
    }
  }

  async getChatHistory(req: Request, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const history = await ChatService.getChatHistory(chatId);

      res.json(history);
    } catch (error) {
      console.error("❌ Error retrieving chat history:", error);
      res.status(500).json({ error: "Failed to retrieve chat history." });
    }
  }

  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { chatId, message } = req.body;

      if (!chatId || !message) {
        res.status(400).json({ error: "Both chatId and message are required." });
        return;
      }

      console.info(`📩 Received message in chat ${chatId}: ${message}`);

      // Save the user's message
      await ChatService.saveMessage(chatId, "user", message);

      // Retrieve the chat history to maintain context
      const chatHistory = (await ChatService.getChatHistory(chatId)).map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: msg.text,
      }));

      // Send the chat history to the AI model
      const botResponse = await OllamaService.sendMessageWithHistory(chatHistory);
      console.info("🤖 AI Response:", botResponse);

      // Save the AI's response
      await ChatService.saveMessage(chatId, "bot", botResponse);

      res.json({ response: botResponse });
    } catch (error) {
      console.error("❌ Error in sendMessage:", error);
      res.status(500).json({ error: "Server error while processing the message." });
    }
  }

  async deleteChat(req: Request, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      await ChatService.deleteChat(chatId);
      res.status(200).json({ message: "Chat deleted successfully." });
    } catch (error) {
      console.error("❌ Error deleting chat:", error);
      res.status(500).json({ error: "Failed to delete chat." });
    }
  }
}

export default new ChatController();
