import axios from "axios";

const API_URL = "http://localhost:4000/api/chats";

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
      console.error("❌ Error al obtener chats:", error);
      return [];
    }
  }

  async createChat(title: string): Promise<Chat | null> {
    try {
      const response = await axios.post(`${this.apiUrl}/new`, { title });
      return response.data;
    } catch (error) {
      console.error("❌ Error al crear un chat:", error);
      return null;
    }
  }

  async deleteChat(chatId: string): Promise<void> {
    try {
      await axios.delete(`${this.apiUrl}/${chatId}`);
    } catch (error) {
      console.error(`❌ Error al eliminar el chat ${chatId}:`, error);
    }
  }

  async getChatHistory(chatId: string): Promise<Message[]> {
    try {
      const response = await axios.get(`${this.apiUrl}/${chatId}/history`);
      return response.data;
    } catch (error) {
      console.error(`❌ Error al obtener el historial del chat ${chatId}:`, error);
      return [];
    }
  }

  async sendMessage(chatId: string, message: string): Promise<string> {
    try {
      const response = await axios.post(`${this.apiUrl}/${chatId}/message`, { message, chatId });
      return response.data.response;
    } catch (error) {
      console.error(`❌ Error al enviar mensaje al chat ${chatId}:`, error);
      return "Error al conectar con el servidor.";
    }
  }
}

export default new ChatService(API_URL);
