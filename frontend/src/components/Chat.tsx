import { Box } from "@mui/material";
import Header from "./Header";
import ChatWindow from "./ChatWindow";
import ChatInput from "./ChatInput";
import useChat from "../hooks/useChat";

const Chat = () => {
  const { chats, currentChatId, sendMessage, createNewChat, selectChat, loading } = useChat();
  const currentChat = chats.find((chat) => chat.id === currentChatId) || { messages: [] };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      <Header chats={chats} onSelectChat={selectChat} onNewChat={createNewChat} />

      <Box sx={{ flex: 1, p: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <ChatWindow messages={currentChat.messages} loading={loading} />
        <ChatInput sendMessage={sendMessage} />
      </Box>
    </Box>
  );
};

export default Chat;
