import { Drawer, Box, Typography, Divider, IconButton } from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import { useNavigate } from "react-router-dom";
import ChatList from "./ChatList";

const DrawerMenu = () => {
  const navigate = useNavigate();

  return (
    <Drawer variant="permanent" sx={{ width: 250, flexShrink: 0 }}>
      <Box sx={{ width: 250, p: 2, display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}>
        <IconButton onClick={() => navigate("/")} sx={{ mb: 1 }}>
          <HomeIcon sx={{ fontSize: 30, color: "primary.main" }} />
        </IconButton>

        <Typography variant="h6">My Chats</Typography>
        <Divider sx={{ my: 2, width: "100%" }} />

        {/* Chat List */}
        <ChatList />
      </Box>
    </Drawer>
  );
};

export default DrawerMenu;
