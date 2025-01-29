import { useState } from "react";
import axios from "axios";
import { Box, TextField, Button, Typography, Paper } from "@mui/material";

interface Message {
  text: string;
  sender: "user" | "bot";
}

const Chat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessage: Message = { text: input, sender: "user" };
    setMessages([...messages, newMessage]);
    setInput("");

    try {
      const response = await axios.post("http://localhost:3001/chat", { prompt: input });
      setMessages((prev) => [
        ...prev,
        { text: response.data.response, sender: "bot" },
      ]);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  return (
    <Box sx={{ p: 4, maxWidth: 600, mx: "auto" }}>
      <Typography variant="h4" gutterBottom>
        Chat con IA
      </Typography>
      <Paper sx={{ p: 2, mb: 2, height: 400, overflowY: "auto" }}>
        {messages.map((msg, index) => (
          <Typography
            key={index}
            sx={{
              textAlign: msg.sender === "user" ? "right" : "left",
              bgcolor: msg.sender === "user" ? "primary.light" : "grey.300",
              p: 1,
              borderRadius: 1,
              mb: 1,
            }}
          >
            {msg.text}
          </Typography>
        ))}
      </Paper>
      <Box sx={{ display: "flex", gap: 2 }}>
        <TextField
          fullWidth
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe un mensaje..."
        />
        <Button variant="contained" onClick={sendMessage}>
          Enviar
        </Button>
      </Box>
    </Box>
  );
};

export default Chat;
