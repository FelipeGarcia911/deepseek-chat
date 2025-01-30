import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import ChatService, { Chat } from "../../services/Chat";

export const fetchChats = createAsyncThunk("chat/fetchChats", async () => {
  return await ChatService.fetchChats();
});

export const fetchChatHistory = createAsyncThunk("chat/fetchChatHistory", async (chatId: string) => {
  const messages = await ChatService.getChatHistory(chatId);
  return { chatId, messages };
});

export const createChat = createAsyncThunk("chat/createChat", async (title: string) => {
  const chat = await ChatService.createChat(title);
  if (!chat) throw new Error("No se pudo crear el chat");
  return chat;
});

export const sendMessage = createAsyncThunk(
  "chat/sendMessage",
  async ({ chatId, message }: { chatId: string; message: string }, { dispatch }) => {
    dispatch(addUserMessage({ chatId, message }));
    const response = await ChatService.sendMessage(chatId, message);

    return { chatId, response };
  }
);

interface ChatState {
  chats: Chat[];
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
        chat.messages.push({ text: message, sender: "user" });
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchChats.pending, (state) => {
        state.isLoadingChats = true;
      })
      .addCase(fetchChats.fulfilled, (state, action: PayloadAction<Chat[]>) => {
        state.chats = action.payload;
        state.isLoadingChats = false;
      })
      .addCase(fetchChats.rejected, (state) => {
        state.isLoadingChats = false;
      })

      .addCase(fetchChatHistory.fulfilled, (state, action) => {
        const { chatId, messages } = action.payload;
        const chat = state.chats.find((c) => c.id === chatId);
        if (chat) {
          chat.messages = messages;
        }
      })

      .addCase(createChat.fulfilled, (state, action: PayloadAction<Chat>) => {
        state.chats.push(action.payload);
      })

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
          chat.messages.push({ text: response, sender: "bot" });
        }
        state.isSendingMessage = false;
      });
  },
});

export const { addUserMessage } = chatSlice.actions;

export default chatSlice.reducer;
