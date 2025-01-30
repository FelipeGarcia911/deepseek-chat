import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "../store";
import { useEffect, useState } from "react";
import { fetchChatHistory, sendMessage } from "../store/reducers/Chat";

const useChat = (id: string) => {
  const dispatch = useDispatch<AppDispatch>();

  const { chats, loading } = useSelector((state: RootState) => state.chat);

  const chat = chats.find((c) => c.id === id);

  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (id) {
      dispatch(fetchChatHistory(id));
    }
  }, [dispatch, id]);

  const sendChatMessage = async (input: string) => {
    if (!input.trim() || !chat) return;

    setIsSending(true);
    await dispatch(sendMessage({ chatId: chat.id, message: input }));
    setIsSending(false);
  };

  return { chats, chat, sendMessage: sendChatMessage, loading, isSending };
};

export default useChat;
