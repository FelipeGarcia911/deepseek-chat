import { Box, TextField, Button } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import { useState } from "react";

interface ChatInputProps {
  sendMessage: (input: string) => void;
}

const ChatInput = ({ sendMessage }: ChatInputProps) => {
  const [input, setInput] = useState<string>("");

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value || "");
  };

  const onSend = () => {
    if (input.trim() !== "") {
      sendMessage(input);
      setInput("");
    }
  };

  return (
    <Box sx={{ display: "flex", gap: 2, mt: 2, width: "90%", maxWidth: 800 }}>
      <TextField
        fullWidth
        value={input || ""}
        variant="outlined"
        onChange={handleOnChange}
        onKeyDown={handleKeyPress}
        placeholder="Escribe un mensaje..."
      />
      <Button variant="contained" onClick={onSend} endIcon={<SendIcon />}>
        Enviar
      </Button>
    </Box>
  );
};

export default ChatInput;
