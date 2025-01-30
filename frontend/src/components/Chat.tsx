import { Box, CircularProgress } from "@mui/material";
import ChatWindow from "./ChatWindow";
import ChatInput from "./ChatInput";
import useChat from "../hooks/useChat";

interface ChatProps {
  id: string;
}

const Chat = ({ id }: ChatProps) => {
  const { chat, sendMessage, loading } = useChat(id);
  console.log("🚀 ~ Chat ~ chat:", chat);

  if (!id) return <Box sx={{ p: 4 }}>⚠️ No hay ID de chat válido.</Box>;
  if (loading) <CircularProgress />;
  if (!chat) return <Box sx={{ p: 4 }}>❌ Chat no encontrado.</Box>;

  return (
    <Box sx={{ flex: 1, p: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <ChatWindow messages={chat.messages} loading={loading} />
      <ChatInput sendMessage={sendMessage} />
    </Box>
  );
};

export default Chat;
