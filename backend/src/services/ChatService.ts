interface ChatHistory {
  [chatId: string]: { role: string; content: string }[];
}

class ChatService {
  private chatHistories: ChatHistory = {};

  getChatHistory(chatId: string) {
    return this.chatHistories[chatId] || [];
  }

  saveMessage(chatId: string, role: "user" | "bot", content: string) {
    if (!this.chatHistories[chatId]) {
      this.chatHistories[chatId] = [];
    }
    this.chatHistories[chatId].push({ role, content });
  }
}

export default new ChatService();
