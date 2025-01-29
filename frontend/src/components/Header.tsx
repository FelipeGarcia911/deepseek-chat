import { useState } from "react";
import { AppBar, Toolbar, Typography, IconButton } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import Sidebar from "./Sidebar";

interface HeaderProps {
  chats: { id: string; title: string }[];
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
}

const Header = ({ chats, onSelectChat, onNewChat }: HeaderProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => setOpen(true)}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Chat con IA
          </Typography>
        </Toolbar>
      </AppBar>

      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
        chats={chats}
        onSelectChat={onSelectChat}
        onNewChat={onNewChat}
      />
    </>
  );
};

export default Header;
