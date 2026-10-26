import { z } from "zod";

// Legacy prototype contracts for /api/chats. Identifiers come from Date.now(); P2.6 retires them.
export const chatTitleMaxLength = 120;
export const messageMaxLength = 4000;

export const LegacyChatId = z.string().regex(/^\d{1,20}$/, "Must be a legacy numeric chat identifier.");

export const ChatParams = z.strictObject({ chatId: LegacyChatId });
export type ChatParams = z.infer<typeof ChatParams>;

export const CreateChatRequest = z.strictObject({
  title: z.string().trim().min(1).max(chatTitleMaxLength),
});
export type CreateChatRequest = z.infer<typeof CreateChatRequest>;

export const SendMessageRequest = z.strictObject({
  message: z.string().max(messageMaxLength).regex(/\S/, "Must contain non-whitespace text."),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

export const ChatSummary = z.object({ id: LegacyChatId, title: z.string() });
export type ChatSummary = z.infer<typeof ChatSummary>;

export const ChatList = z.array(ChatSummary);

export const LegacyMessage = z.object({ text: z.string(), sender: z.enum(["user", "bot"]) });
export type LegacyMessage = z.infer<typeof LegacyMessage>;

export const ChatHistory = z.array(LegacyMessage);

export const SendMessageResponse = z.object({ response: z.string() });

export const DeleteChatResponse = z.object({ message: z.string() });
