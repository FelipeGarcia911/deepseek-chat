import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/store";
import { useEffect, useRef, useState } from "react";
import { fetchChatHistory, sendMessage } from "@/store/reducers/Chat";

const useChat = (id: string) => {
  const dispatch = useDispatch<AppDispatch>();
  const [loaded, setLoaded] = useState(false);

  const { chats, isSendingMessage, isLoadingChats, streaming } = useSelector((state: RootState) => state.chat);
  const pending = useRef<{ abort: () => void } | null>(null);

  const chat = chats.find((c) => c.id === id);

  useEffect(() => {
    const exists = chats.find((c) => c.id === id) && !loaded;
    if (exists) {
      dispatch(fetchChatHistory(id));
      setLoaded(true);
    }
  }, [dispatch, id, chats, loaded]);

  const sendChatMessage = async (input: string) => {
    if (!input.trim() || !chat) return;

    const request = dispatch(sendMessage({ chatId: chat.id, message: input }));
    pending.current = request;
    await request;
    pending.current = null;
  };

  const stopMessage = () => pending.current?.abort();
  const streamingText = streaming?.chatId === id ? streaming.text : "";

  return { chats, chat, sendMessage: sendChatMessage, stopMessage, streamingText, isSendingMessage, isLoadingChats };
};

export default useChat;
