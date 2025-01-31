import fs from "fs/promises";
import path from "path";

const CHAT_STORAGE_PATH = path.join(__dirname, process.env.LOGS_PATH || "../logs/chats.json");

interface Message {
  text: string;
  sender: "user" | "bot";
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

class ChatService {
  private chats: Chat[] = [];

  constructor() {
    this.loadChatsFromFile();
  }

  private async loadChatsFromFile(): Promise<void> {
    try {
      const data = await fs.readFile(CHAT_STORAGE_PATH, "utf-8");
      this.chats = JSON.parse(data) || [];
    } catch (error) {
      console.warn("⚠️ No existing chat file found. Starting fresh.");
      this.chats = [];
    }
  }

  private async saveChatsToFile(): Promise<void> {
    try {
      await fs.writeFile(CHAT_STORAGE_PATH, JSON.stringify(this.chats, null, 2));
    } catch (error) {
      console.error("❌ Failed to save chats to file:", error);
    }
  }

  getChats(): { id: string; title: string }[] {
    return this.chats.map(({ id, title }) => ({ id, title }));
  }

  getChatHistory(chatId: string): Message[] {
    return this.chats.find((chat) => chat.id === chatId)?.messages || [];
  }

  async createChat(title: string): Promise<{ id: string; title: string }> {
    const newChat: Chat = { id: Date.now().toString(), title, messages: [] };
    this.chats.push(newChat);
    await this.saveChatsToFile();
    return { id: newChat.id, title: newChat.title };
  }

  async saveMessage(chatId: string, sender: "user" | "bot", text: string): Promise<void> {
    const chat = this.chats.find((c) => c.id === chatId);
    if (!chat) return;

    chat.messages.push({ text, sender });
    await this.saveChatsToFile();
  }

  async deleteChat(chatId: string): Promise<void> {
    this.chats = this.chats.filter((chat) => chat.id !== chatId);
    await this.saveChatsToFile();
  }
}

export default new ChatService();
