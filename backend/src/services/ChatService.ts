import fs from "fs/promises";
import type { LegacyMessage as Message } from "@chat-app/shared";
import { AppError } from "../errors";

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

class ChatService {
  private chats: Chat[] = [];

  constructor(private readonly storagePath: string) {}

  async initialize(): Promise<void> {
    await this.loadChatsFromFile();
  }

  private async loadChatsFromFile(): Promise<void> {
    try {
      const data = await fs.readFile(this.storagePath, "utf-8");
      this.chats = JSON.parse(data) || [];
    } catch {
      console.warn("⚠️ No existing chat file found. Starting fresh.");
      this.chats = [];
    }
  }

  // Writes before replacing memory so a failed write leaves no unsaved state behind.
  private async commit(chats: Chat[]): Promise<void> {
    try {
      await fs.writeFile(this.storagePath, JSON.stringify(chats, null, 2));
    } catch (error) {
      throw new AppError("DEPENDENCY_UNAVAILABLE", "Chat storage is unavailable.", error);
    }
    this.chats = chats;
  }

  getChats(): { id: string; title: string }[] {
    return this.chats.map(({ id, title }) => ({ id, title }));
  }

  getChatHistory(chatId: string): Message[] | undefined {
    return this.chats.find((chat) => chat.id === chatId)?.messages;
  }

  async createChat(title: string): Promise<{ id: string; title: string }> {
    const newChat: Chat = { id: Date.now().toString(), title, messages: [] };
    await this.commit([...this.chats, newChat]);
    return { id: newChat.id, title: newChat.title };
  }

  async saveMessage(chatId: string, sender: "user" | "bot", text: string): Promise<void> {
    if (!this.chats.some((c) => c.id === chatId)) return;

    await this.commit(
      this.chats.map((chat) =>
        chat.id === chatId ? { ...chat, messages: [...chat.messages, { text, sender }] } : chat
      )
    );
  }

  async deleteChat(chatId: string): Promise<boolean> {
    const remaining = this.chats.filter((chat) => chat.id !== chatId);
    if (remaining.length === this.chats.length) return false;
    await this.commit(remaining);
    return true;
  }
}

export default ChatService;
