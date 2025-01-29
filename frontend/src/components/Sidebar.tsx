import { Drawer, List, ListItem, ListItemText, Divider, Button, Box, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  chats: { id: string; title: string }[];
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
}

const Sidebar = ({ open, onClose, chats, onSelectChat, onNewChat }: SidebarProps) => {
  return (
    <Drawer open={open} onClose={onClose}>
      <Box sx={{ width: 250, p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Chats
        </Typography>
        <Button
          variant="contained"
          fullWidth
          startIcon={<AddIcon />}
          onClick={() => {
            onNewChat();
            onClose();
          }}
        >
          Nuevo Chat
        </Button>
        <Divider sx={{ my: 2 }} />
        <List>
          {chats.map((chat) => (
            <ListItem
              button
              key={chat.id}
              onClick={() => {
                onSelectChat(chat.id);
                onClose();
              }}
            >
              <ListItemText primary={chat.title} />
            </ListItem>
          ))}
        </List>
      </Box>
    </Drawer>
  );
};

export default Sidebar;
