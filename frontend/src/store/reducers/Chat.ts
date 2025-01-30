import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import ChatService, { Chat } from "../../services/Chat";

// 📌 Obtener todos los chats del backend
export const fetchChats = createAsyncThunk("chat/fetchChats", async () => {
  return await ChatService.fetchChats();
});

// 📌 Obtener historial de un chat específico
export const fetchChatHistory = createAsyncThunk("chat/fetchChatHistory", async (chatId: string) => {
  const messages = await ChatService.getChatHistory(chatId);
  return { chatId, messages };
});

// 📌 Crear un nuevo chat en el backend
export const createChat = createAsyncThunk("chat/createChat", async (title: string) => {
  const chat = await ChatService.createChat(title);
  if (!chat) throw new Error("No se pudo crear el chat");
  return chat;
});

// 📌 Enviar un mensaje al backend y obtener la respuesta
export const sendMessage = createAsyncThunk(
  "chat/sendMessage",
  async ({ chatId, message }: { chatId: string; message: string }) => {
    const botResponse = await ChatService.sendMessage(chatId, message);
    return { chatId, userMessage: message, botResponse };
  }
);

interface ChatState {
  chats: Chat[];
  loading: boolean;
}

const initialState: ChatState = {
  chats: [],
  loading: false,
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchChats.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchChats.fulfilled, (state, action: PayloadAction<Chat[]>) => {
        state.chats = action.payload;
        state.loading = false;
      })
      .addCase(fetchChats.rejected, (state) => {
        state.loading = false;
      })

      // 📌 Obtener historial de un chat
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

      .addCase(sendMessage.fulfilled, (state, action) => {
        const { chatId, userMessage, botResponse } = action.payload;
        const chat = state.chats.find((c) => c.id === chatId);
        if (chat) {
          chat.messages.push({ text: userMessage, sender: "user" });
          chat.messages.push({ text: botResponse, sender: "bot" });
        }
      });
  },
});

export default chatSlice.reducer;
