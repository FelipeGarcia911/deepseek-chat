import { randomUUID } from "node:crypto";
import fs from "fs/promises";
import type { ConversationSummary, Message } from "@chat-app/shared";
import { AppError } from "../errors";

interface StoredConversation extends ConversationSummary {
  messages: Message[];
}

const now = () => new Date().toISOString();

class ConversationService {
  private conversations: StoredConversation[] = [];

  constructor(private readonly storagePath: string) {}

  async initialize(): Promise<void> {
    try {
      const data = await fs.readFile(this.storagePath, "utf-8");
      this.conversations = JSON.parse(data) || [];
    } catch {
      console.warn("⚠️ No existing conversation file found. Starting fresh.");
      this.conversations = [];
    }
  }

  private async commit(conversations: StoredConversation[]): Promise<void> {
    try {
      await fs.writeFile(this.storagePath, JSON.stringify(conversations, null, 2));
    } catch (error) {
      throw new AppError("DEPENDENCY_UNAVAILABLE", "Conversation storage is unavailable.", error);
    }
    this.conversations = conversations;
  }

  listConversations(): ConversationSummary[] {
    return this.conversations.map(({ id, title, createdAt }) => ({ id, title, createdAt })).reverse();
  }

  getMessages(conversationId: string): Message[] | undefined {
    return this.conversations.find((conversation) => conversation.id === conversationId)?.messages;
  }

  async createConversation(title: string): Promise<ConversationSummary> {
    const conversation: StoredConversation = { id: randomUUID(), title, createdAt: now(), messages: [] };
    await this.commit([...this.conversations, conversation]);
    return { id: conversation.id, title, createdAt: conversation.createdAt };
  }

  async appendMessage(conversationId: string, role: Message["role"], content: string): Promise<Message | undefined> {
    if (!this.getMessages(conversationId)) return undefined;
    const message: Message = { id: randomUUID(), role, content, createdAt: now() };
    await this.commit(
      this.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, messages: [...conversation.messages, message] }
          : conversation
      )
    );
    return message;
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const remaining = this.conversations.filter((conversation) => conversation.id !== conversationId);
    if (remaining.length === this.conversations.length) return false;
    await this.commit(remaining);
    return true;
  }
}

export default ConversationService;
