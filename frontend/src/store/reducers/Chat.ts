import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import { v4 as uuid } from "uuid";
import ConversationService, { type Conversation } from "../../services/Conversations";

export const fetchChats = createAsyncThunk("chat/fetchChats", async () => {
  return await ConversationService.listConversations();
});

export const fetchChatHistory = createAsyncThunk("chat/fetchChatHistory", async (chatId: string) => {
  const messages = await ConversationService.listMessages(chatId);
  return { chatId, messages };
});

export const createChat = createAsyncThunk("chat/createChat", async (title: string) => {
  return await ConversationService.createConversation(title);
});

export const deleteChat = createAsyncThunk("chat/deleteChat", async (chatId: string) => {
  await ConversationService.deleteConversation(chatId);
  return chatId;
});

export const sendMessage = createAsyncThunk(
  "chat/sendMessage",
  async ({ chatId, message }: { chatId: string; message: string }, { dispatch }) => {
    dispatch(addUserMessage({ chatId, message }));
    const response = await ConversationService.sendMessage(chatId, message);

    return { chatId, response };
  }
);

interface ChatState {
  chats: Conversation[];
  isLoadingChats: boolean;
  isSendingMessage: boolean;
}

const initialState: ChatState = {
  chats: [],
  isLoadingChats: false,
  isSendingMessage: false,
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    addUserMessage: (state, action: PayloadAction<{ chatId: string; message: string }>) => {
      const { chatId, message } = action.payload;
      const chat = state.chats.find((c) => c.id === chatId);
      if (chat) {
        chat.messages.push({ id: uuid(), role: "user", content: message, createdAt: new Date().toISOString() });
      }
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
      .addCase(sendMessage.pending, (state) => {
        state.isSendingMessage = true;
      })
      .addCase(sendMessage.rejected, (state) => {
        state.isSendingMessage = false;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        const { chatId, response } = action.payload;
        const chat = state.chats.find((c) => c.id === chatId);
        if (chat) {
          chat.messages.push(response);
        }
        state.isSendingMessage = false;
      });
  },
});

export const { addUserMessage } = chatSlice.actions;

export default chatSlice.reducer;
