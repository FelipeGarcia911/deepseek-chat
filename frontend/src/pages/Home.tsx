import { Box, TextField, Button, Typography, CircularProgress } from "@mui/material";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { AppDispatch } from "@/store";
import { createChat } from "@/store/reducers/Chat";

const CreateConversation = ({ assistantSlug }: { assistantSlug: string }) => {
  const [chatName, setChatName] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const handleCreateChat = async () => {
    if (!chatName.trim()) return;

    setLoading(true);

    try {
      const newChat = await dispatch(createChat({ assistantSlug, title: chatName })).unwrap();
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

const Home = () => {
  const { assistantSlug } = useParams<{ assistantSlug: string }>();

  if (!assistantSlug) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
        <Typography>Abre /c/&lt;asistente&gt; para empezar una conversación.</Typography>
      </Box>
    );
  }

  return <CreateConversation key={assistantSlug} assistantSlug={assistantSlug} />;
};

export default Home;
