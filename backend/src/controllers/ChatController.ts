import { Request, Response } from "express";
import type ChatService from "../services/ChatService";

enum ChatServiceMethod {
  GetChats = "getChats",
  CreateChat = "createChat",
  GetChatHistory = "getChatHistory",
  DeleteChat = "deleteChat",
}

export interface ChatControllerDependencies {
  chatService: Pick<ChatService, ChatServiceMethod>;
}

class ChatController {
  constructor(private readonly dependencies: ChatControllerDependencies) {}

  getChats = async (_req: Request, res: Response): Promise<void> => {
    try {
      const chats = await this.dependencies.chatService.getChats();
      res.json(chats);
    } catch (error) {
      console.error("❌ Error retrieving chats:", error);
      res.status(500).json({ error: "Failed to fetch chats." });
    }
  };

  createChat = async (req: Request, res: Response): Promise<void> => {
    try {
      const { title } = req.body;
      if (!title) {
        res.status(400).json({ error: "Chat title is required." });
        return;
      }

      const newChat = await this.dependencies.chatService.createChat(title);
      res.status(201).json(newChat);
    } catch (error) {
      console.error("❌ Error creating chat:", error);
      res.status(500).json({ error: "Failed to create chat." });
    }
  };

  getChatHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { chatId } = req.params;
      const history = await this.dependencies.chatService.getChatHistory(chatId);

      res.json(history);
    } catch (error) {
      console.error("❌ Error retrieving chat history:", error);
      res.status(500).json({ error: "Failed to retrieve chat history." });
    }
  };

  sendMessage = async (_req: Request, res: Response): Promise<void> => {
    res.status(503).json({
      code: "MODEL_NOT_CONFIGURED",
      error: "No Model Profile has been configured.",
    });
  };

  deleteChat = async (req: Request, res: Response): Promise<void> => {
    try {
      const { chatId } = req.params;
      await this.dependencies.chatService.deleteChat(chatId);
      res.status(200).json({ message: "Chat deleted successfully." });
    } catch (error) {
      console.error("❌ Error deleting chat:", error);
      res.status(500).json({ error: "Failed to delete chat." });
    }
  };
}

export default ChatController;
