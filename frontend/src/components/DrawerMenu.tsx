import { Drawer, List, ListItem, ListItemText, Divider, Box, Typography, CircularProgress } from "@mui/material";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import { useNavigate } from "react-router-dom";

const DrawerMenu = () => {
  const { chats = [], loading } = useSelector((state: RootState) => state.chat);
  const navigate = useNavigate();

  return (
    <Drawer variant="permanent" sx={{ width: 250, flexShrink: 0 }}>
      <Box sx={{ width: 250, p: 2 }}>
        <Typography variant="h6">Mis Chats</Typography>
        <Divider sx={{ my: 2 }} />

        {loading ? (
          <CircularProgress sx={{ display: "block", margin: "auto" }} />
        ) : (
          <List>
            {chats.map((chat) => (
              <ListItem button key={chat.id} onClick={() => navigate(`/chat/${chat.id}`)}>
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
