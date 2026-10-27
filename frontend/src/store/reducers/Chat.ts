import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import ConversationService, { type Conversation, type Message } from "@/services/Conversations";
import { consumeMessageStream } from "@/services/messageStream";

export const fetchChats = createAsyncThunk("chat/fetchChats", async () => {
  return await ConversationService.listConversations();
});

export const fetchChatHistory = createAsyncThunk("chat/fetchChatHistory", async (chatId: string) => {
  const messages = await ConversationService.listMessages(chatId);
  return { chatId, messages };
});

export const createChat = createAsyncThunk(
  "chat/createChat",
  async ({ assistantSlug, title }: { assistantSlug: string; title: string }) => {
    return await ConversationService.createConversation(assistantSlug, title);
  }
);

export const deleteChat = createAsyncThunk("chat/deleteChat", async (chatId: string) => {
  await ConversationService.deleteConversation(chatId);
  return chatId;
});

export const sendMessage = createAsyncThunk(
  "chat/sendMessage",
  async ({ chatId, message }: { chatId: string; message: string }, { dispatch, signal }) => {
    const response = await consumeMessageStream(ConversationService.sendMessage(chatId, message, signal), {
      onAccepted: (accepted) => dispatch(messageAccepted({ chatId, message: accepted })),
      onDelta: (text) => dispatch(deltaReceived(text)),
    });
    return { chatId, response };
  }
);

interface ChatState {
  chats: Conversation[];
  isLoadingChats: boolean;
  isSendingMessage: boolean;
  streaming: { chatId: string; text: string } | null;
}

const initialState: ChatState = {
  chats: [],
  isLoadingChats: false,
  isSendingMessage: false,
  streaming: null,
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    messageAccepted: (state, action: PayloadAction<{ chatId: string; message: Message }>) => {
      state.chats.find((chat) => chat.id === action.payload.chatId)?.messages.push(action.payload.message);
    },
    deltaReceived: (state, action: PayloadAction<string>) => {
      if (state.streaming) state.streaming.text += action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // FetchChats
      .addCase(fetchChats.pending, (state) => {
        state.isLoadingChats = true;
      })
      .addCase(fetchChats.fulfilled, (state, action: PayloadAction<Conversation[]>) => {
        state.chats = action.payload;
        state.isLoadingChats = false;
      })
      .addCase(fetchChats.rejected, (state) => {
        state.isLoadingChats = false;
      })

      // DeleteChat
      .addCase(deleteChat.fulfilled, (state, action: PayloadAction<string>) => {
        state.chats = state.chats.filter((chat) => chat.id !== action.payload);
      })
      .addCase(deleteChat.rejected, (_, action) => {
        console.error("❌ Error deleting chat:", action.error);
      })

      // FetchChatHistory
      .addCase(fetchChatHistory.fulfilled, (state, action) => {
        const { chatId, messages } = action.payload;
        const chat = state.chats.find((c) => c.id === chatId);
        if (chat) {
          chat.messages = messages;
        }
      })

      // CreateChat
      .addCase(createChat.fulfilled, (state, action: PayloadAction<Conversation>) => {
        state.chats.push(action.payload);
      })

      // SendMessage
      .addCase(sendMessage.pending, (state, action) => {
        state.isSendingMessage = true;
        state.streaming = { chatId: action.meta.arg.chatId, text: "" };
      })
      .addCase(sendMessage.rejected, (state) => {
        state.isSendingMessage = false;
        state.streaming = null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        const { chatId, response } = action.payload;
        const chat = state.chats.find((c) => c.id === chatId);
        if (chat) {
          chat.messages.push(response);
        }
        state.isSendingMessage = false;
        state.streaming = null;
      });
  },
});

export const { messageAccepted, deltaReceived } = chatSlice.actions;

export default chatSlice.reducer;
