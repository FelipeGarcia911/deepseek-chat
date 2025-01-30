import React from "react";
import { useParams } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import ChatWindow from "./ChatWindow";
import ChatInput from "./ChatInput";
import useChat from "../hooks/useChat";

const Chat = () => {
  const { id } = useParams<{ id: string }>();
  const { chat, sendMessage, isLoadingChats, isSendingMessage } = useChat(id || "");

  if (!id) return <Box sx={{ p: 4 }}>⚠️ No hay ID de chat válido.</Box>;

  return (
    <Box sx={{ flex: 1, p: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
      {isLoadingChats ? (
        <CircularProgress />
      ) : chat ? (
        <>
          <ChatWindow messages={chat.messages} loading={isSendingMessage} />
          <ChatInput sendMessage={sendMessage} />
        </>
      ) : (
        <Box sx={{ p: 4 }}>❌ Chat no encontrado.</Box>
      )}
    </Box>
  );
};

export default React.memo(Chat);
