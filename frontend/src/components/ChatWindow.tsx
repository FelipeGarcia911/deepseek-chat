import { Box, Paper, Typography } from "@mui/material";
import type { Message } from "@/services/Conversations";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ChatSkeleton from "./ChatSkeleton";

interface ChatWindowProps {
  messages?: Message[];
  loading: boolean;
  streamingText?: string;
}

const ChatWindow = ({ messages = [], loading, streamingText = "" }: ChatWindowProps) => {
  const shown: Message[] = streamingText
    ? [...messages, { id: "streaming", role: "assistant", content: streamingText, createdAt: "" }]
    : messages;

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streamingText]);

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
        gap: 1,
      }}
    >
      {shown.map((msg) => (
        <Box
          key={msg.id}
          sx={{
            display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
          }}
        >
          <Box
            sx={{
              bgcolor: msg.role === "user" ? "primary.light" : "grey.300",
              color: msg.role === "user" ? "white" : "black",
              p: 1.5,
              borderRadius: "12px",
              maxWidth: "80%",
              textAlign: msg.role === "user" ? "right" : "left",
              boxShadow: 1,
            }}
          >
            {msg.role === "assistant" ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            ) : (
              <Typography>{msg.content}</Typography>
            )}
          </Box>
        </Box>
      ))}

      {loading && !streamingText && <ChatSkeleton />}

      <div ref={chatEndRef} />
    </Paper>
  );
};

export default ChatWindow;
