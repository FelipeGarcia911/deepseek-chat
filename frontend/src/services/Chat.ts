import axios from "axios";

import { config } from "../config";

export interface Message {
  text: string;
  sender: "user" | "bot";
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

class ChatService {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async fetchChats(): Promise<Chat[]> {
    try {
      const response = await axios.get(`${this.apiUrl}/list`);
      return response.data;
    } catch (error) {
      console.error("❌ Failed to fetch chats:", error);
      return [];
    }
  }

  async createChat(title: string): Promise<Chat | null> {
    try {
      const response = await axios.post(`${this.apiUrl}/new`, { title });
      return response.data;
    } catch (error) {
      console.error("❌ Failed to create chat:", error);
      return null;
    }
  }

  async deleteChat(chatId: string): Promise<void> {
    try {
      await axios.delete(`${this.apiUrl}/${chatId}`);
    } catch (error) {
      console.error(`❌ Failed to delete chat ${chatId}:`, error);
    }
  }

  async getChatHistory(chatId: string): Promise<Message[]> {
    try {
      const response = await axios.get(`${this.apiUrl}/${chatId}/history`);
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to fetch history for chat ${chatId}:`, error);
      return [];
    }
  }

  async sendMessage(chatId: string, message: string): Promise<string> {
    const response = await axios.post(`${this.apiUrl}/${chatId}/message`, { message, chatId });
    return response.data.response;
  }
}

export default new ChatService(`${config.apiBaseUrl}/chats`);
