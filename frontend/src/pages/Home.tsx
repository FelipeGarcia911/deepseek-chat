import { Box, TextField, Button, Typography, CircularProgress } from "@mui/material";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { AppDispatch } from "../store";
import { createChat } from "../store/reducers/Chat";

const Home = () => {
  const [chatName, setChatName] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const handleCreateChat = async () => {
    if (!chatName.trim()) return;

    setLoading(true);

    try {
      const newChat = await dispatch(createChat(chatName)).unwrap();
      navigate(`/chat/${newChat.id}`);
    } catch (error) {
      console.error("❌ Error al crear chat:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "80vh" }}
    >
      <Typography variant="h4" sx={{ mb: 2 }}>
        Crear un Nuevo Chat
      </Typography>
      <TextField
        value={chatName}
        onChange={(e) => setChatName(e.target.value)}
        placeholder="Ingresa el nombre del chat..."
        onKeyDown={(e) => e.key === "Enter" && handleCreateChat()}
        sx={{ mb: 2, width: "300px" }}
        disabled={loading}
      />
      <Button variant="contained" onClick={handleCreateChat} disabled={loading}>
        {loading ? <CircularProgress size={24} /> : "Crear Chat"}
      </Button>
    </Box>
  );
};

export default Home;
