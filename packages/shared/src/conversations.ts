import { z } from "zod";

export const conversationTitleMaxLength = 120;
export const messageMaxLength = 4000;
export const pageLimitDefault = 20;
export const pageLimitMax = 100;

export const ResourceId = z.uuid();

export const PageQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(pageLimitMax).default(pageLimitDefault),
  cursor: z.string().min(1).optional(),
});
export type PageQuery = z.infer<typeof PageQuery>;

export function Page<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const ConversationParams = z.strictObject({ conversationId: ResourceId });
export type ConversationParams = z.infer<typeof ConversationParams>;

export const CreateConversationRequest = z.strictObject({
  title: z.string().trim().min(1).max(conversationTitleMaxLength),
});
export type CreateConversationRequest = z.infer<typeof CreateConversationRequest>;

export const ConversationSummary = z.object({ id: ResourceId, title: z.string(), createdAt: z.iso.datetime() });
export type ConversationSummary = z.infer<typeof ConversationSummary>;

export const ConversationPage = Page(ConversationSummary);
export type ConversationPage = z.infer<typeof ConversationPage>;

export const Message = z.object({
  id: ResourceId,
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof Message>;

export const MessagePage = Page(Message);
export type MessagePage = z.infer<typeof MessagePage>;

export const SendMessageRequest = z.strictObject({
  content: z.string().max(messageMaxLength).regex(/\S/, "Must contain non-whitespace text."),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

export const SendMessageResponse = Message;
