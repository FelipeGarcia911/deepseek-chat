import { useState, useEffect } from "react";
import { Chat, Message, getSavedChats, saveChats, sendMessageToAPI } from "../services/Chat";

const useChat = () => {
  const [loading, setLoading] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  useEffect(() => {
    setChats(getSavedChats());
  }, []);

  useEffect(() => {
    saveChats(chats);
  }, [chats]);

  const sendMessage = async (input: string) => {
    if (!input.trim() || !currentChatId) return;

    const newUserMessage: Message = { text: input, sender: "user" };

    setChats((prevChats) =>
      prevChats.map((chat) =>
        chat.id === currentChatId ? { ...chat, messages: [...chat.messages, newUserMessage] } : chat
      )
    );

    try {
      setLoading(true);

      const botResponse = await sendMessageToAPI(currentChatId, input);
      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === currentChatId
            ? { ...chat, messages: [...chat.messages, { text: botResponse, sender: "bot" }] }
            : chat
        )
      );
    } catch (error) {
      console.error("❌ Error enviando mensaje:", error);
    } finally {
      setLoading(false);
    }
  };

  const createNewChat = () => {
    const newChat: Chat = { id: Date.now().toString(), title: `Chat ${chats.length + 1}`, messages: [] };
    setChats([...chats, newChat]);
    setCurrentChatId(newChat.id);
  };

  const selectChat = (id: string) => {
    setCurrentChatId(id);
  };

  return { chats, currentChatId, sendMessage, createNewChat, selectChat, loading };
};

export default useChat;
