import {
  Drawer,
  List,
  ListItem,
  ListItemText,
  Divider,
  Box,
  Typography,
  CircularProgress,
  IconButton,
} from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import { useNavigate } from "react-router-dom";

const DrawerMenu = () => {
  const { chats = [], isLoadingChats } = useSelector((state: RootState) => state.chat);
  const navigate = useNavigate();

  return (
    <Drawer variant="permanent" sx={{ width: 250 }}>
      <Box sx={{ width: 250, p: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Typography variant="h6">
          <IconButton onClick={() => navigate("/")} sx={{ mb: 1 }}>
            <HomeIcon sx={{ fontSize: 30, color: "primary.main" }} />
          </IconButton>
          Mis Chats
        </Typography>
        <Divider sx={{ my: 2, width: "100%" }} />

        {isLoadingChats ? (
          <CircularProgress sx={{ display: "block", margin: "auto" }} />
        ) : (
          <List sx={{ width: "100%" }}>
            {chats.map((chat) => (
              <ListItem
                button
                key={chat.id}
                onClick={() => navigate(`/chat/${chat.id}`)}
                sx={{
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <ListItemText primary={chat.title} />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Drawer>
  );
};

export default DrawerMenu;
