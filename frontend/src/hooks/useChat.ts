import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "../store";
import { useEffect, useState } from "react";
import { fetchChatHistory, sendMessage } from "../store/reducers/Chat";

const useChat = (id: string) => {
  const dispatch = useDispatch<AppDispatch>();
  const [loaded, setLoaded] = useState(false);

  const { chats, isSendingMessage, isLoadingChats } = useSelector((state: RootState) => state.chat);

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

    await dispatch(sendMessage({ chatId: chat.id, message: input }));
  };

  return { chats, chat, sendMessage: sendChatMessage, isSendingMessage, isLoadingChats };
};

export default useChat;
