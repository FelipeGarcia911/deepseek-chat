import axios from "axios";
import {
  ChatHistory,
  ChatList,
  ChatSummary,
  DeleteChatResponse,
  SendMessageResponse,
  type LegacyMessage,
} from "@chat-app/shared";

import { config } from "../config";
import { send } from "./ApiError";

export type Message = LegacyMessage;

export interface Chat extends ChatSummary {
  messages: Message[];
}

class ChatService {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async fetchChats(): Promise<Chat[]> {
    const response = await send(axios.get(`${this.apiUrl}/list`));
    return ChatList.parse(response.data).map((chat) => ({ ...chat, messages: [] }));
  }

  async createChat(title: string): Promise<Chat> {
    const response = await send(axios.post(`${this.apiUrl}/new`, { title }));
    return { ...ChatSummary.parse(response.data), messages: [] };
  }

  async deleteChat(chatId: string): Promise<void> {
    const response = await send(axios.delete(`${this.apiUrl}/${chatId}`));
    DeleteChatResponse.parse(response.data);
  }

  async getChatHistory(chatId: string): Promise<Message[]> {
    const response = await send(axios.get(`${this.apiUrl}/${chatId}/history`));
    return ChatHistory.parse(response.data);
  }

  async sendMessage(chatId: string, message: string): Promise<string> {
    const response = await send(axios.post(`${this.apiUrl}/${chatId}/message`, { message }));
    return SendMessageResponse.parse(response.data).response;
  }
}

export default new ChatService(`${config.apiBaseUrl}/chats`);
