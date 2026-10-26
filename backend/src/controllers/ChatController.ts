import { Request, Response } from "express";
import {
  ChatHistory,
  ChatList,
  ChatSummary,
  DeleteChatResponse,
  type ChatParams,
  type CreateChatRequest,
} from "@chat-app/shared";
import { AppError } from "../errors";
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

const chatNotFound = () => new AppError("NOT_FOUND", "Chat not found.");

class ChatController {
  constructor(private readonly dependencies: ChatControllerDependencies) {}

  getChats = async (_req: Request, res: Response): Promise<void> => {
    res.json(ChatList.parse(await this.dependencies.chatService.getChats()));
  };

  createChat = async (req: Request, res: Response): Promise<void> => {
    const { title } = req.body as CreateChatRequest;
    res.status(201).json(ChatSummary.parse(await this.dependencies.chatService.createChat(title)));
  };

  getChatHistory = async (req: Request, res: Response): Promise<void> => {
    const { chatId } = req.params as ChatParams;
    const history = await this.dependencies.chatService.getChatHistory(chatId);
    if (!history) throw chatNotFound();
    res.json(ChatHistory.parse(history));
  };

  sendMessage = async (req: Request, _res: Response): Promise<void> => {
    const { chatId } = req.params as ChatParams;
    if (!(await this.dependencies.chatService.getChatHistory(chatId))) throw chatNotFound();
    throw new AppError("MODEL_NOT_CONFIGURED", "No Model Profile has been configured.");
  };

  deleteChat = async (req: Request, res: Response): Promise<void> => {
    const { chatId } = req.params as ChatParams;
    if (!(await this.dependencies.chatService.deleteChat(chatId))) throw chatNotFound();
    res.json(DeleteChatResponse.parse({ message: "Chat deleted successfully." }));
  };
}

export default ChatController;
