import { Box, Paper, Typography } from "@mui/material";
import { Message } from "../services/Chat";
import { useEffect, useRef } from "react";
import ChatSkeleton from "./ChatSkeleton";

interface ChatWindowProps {
  messages: Message[];
  loading: boolean;
}

const ChatWindow = ({ messages, loading }: ChatWindowProps) => {
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <Paper
      sx={{
        width: "90%",
        maxWidth: 800,
        height: "70vh",
        p: 2,
        overflowY: "auto",
        borderRadius: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1, // Espaciado entre mensajes
      }}
    >
      {messages.map((msg, index) => (
        <Box
          key={index}
          sx={{
            display: "flex",
            justifyContent: msg.sender === "user" ? "flex-end" : "flex-start",
          }}
        >
          <Typography
            sx={{
              bgcolor: msg.sender === "user" ? "primary.light" : "grey.300",
              color: msg.sender === "user" ? "white" : "black",
              p: 1.5,
              borderRadius: "12px",
              maxWidth: "60%",
              textAlign: msg.sender === "user" ? "right" : "left",
              boxShadow: 1,
            }}
          >
            {msg.text}
          </Typography>
        </Box>
      ))}

      {loading && <ChatSkeleton />}

      <div ref={chatEndRef} />
    </Paper>
  );
};

export default ChatWindow;
