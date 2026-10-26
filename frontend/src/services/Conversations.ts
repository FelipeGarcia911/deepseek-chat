import axios from "axios";
import {
  ConversationPage,
  ConversationSummary,
  MessagePage,
  SendMessageResponse,
  pageLimitMax,
  type Message,
} from "@chat-app/shared";

import { config } from "../config";
import { send } from "./ApiError";

export type { Message };

export interface Conversation extends ConversationSummary {
  messages: Message[];
}

class ConversationService {
  private adminUrl: string;
  private runtimeUrl: string;

  constructor(apiBaseUrl: string) {
    this.adminUrl = `${apiBaseUrl}/v1/admin/conversations`;
    this.runtimeUrl = `${apiBaseUrl}/v1/runtime/conversations`;
  }

  private async readAll<T>(url: string, schema: { parse(data: unknown): { items: T[]; nextCursor: string | null } }) {
    const items: T[] = [];
    let cursor: string | undefined;
    do {
      const response = await send(axios.get(url, { params: { limit: pageLimitMax, cursor } }));
      const page = schema.parse(response.data);
      items.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return items;
  }

  async listConversations(): Promise<Conversation[]> {
    const summaries = await this.readAll(this.adminUrl, ConversationPage);
    return summaries.map((summary) => ({ ...summary, messages: [] }));
  }

  async createConversation(title: string): Promise<Conversation> {
    const response = await send(axios.post(this.runtimeUrl, { title }));
    return { ...ConversationSummary.parse(response.data), messages: [] };
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const response = await send(axios.delete(`${this.adminUrl}/${conversationId}`));
    if (response.status !== 204) throw new Error(`Expected 204 No Content, received ${response.status}.`);
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    return this.readAll(`${this.runtimeUrl}/${conversationId}/messages`, MessagePage);
  }

  async sendMessage(conversationId: string, content: string): Promise<Message> {
    const response = await send(axios.post(`${this.runtimeUrl}/${conversationId}/messages`, { content }));
    return SendMessageResponse.parse(response.data);
  }
}

export default new ConversationService(config.apiBaseUrl);
