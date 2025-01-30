import fs from "fs";
import path from "path";

const filePath = path.join(__dirname, "../../chats.json");

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
    this.loadChats();
  }

  private loadChats() {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      this.chats = JSON.parse(data);
    }
  }

  private saveChats() {
    fs.writeFileSync(filePath, JSON.stringify(this.chats, null, 2));
  }

  getChats() {
    return this.chats.map(({ id, title }) => ({ id, title }));
  }

  getChatHistory(chatId: string) {
    return this.chats.find((chat) => chat.id === chatId)?.messages || [];
  }

  createChat(title: string) {
    const newChat: Chat = { id: Date.now().toString(), title, messages: [] };
    this.chats.push(newChat);
    this.saveChats();
    return { id: newChat.id, title: newChat.title };
  }

  saveMessage(chatId: string, sender: "user" | "bot", text: string) {
    const chat = this.chats.find((c) => c.id === chatId);
    if (!chat) return;

    chat.messages.push({ text, sender });
    this.saveChats();
  }
}

export default new ChatService();
