import { ListItem, ListItemText, IconButton } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { AppDispatch } from "../../store";
import { deleteChat } from "../../store/reducers/Chat";

interface ChatListItemProps {
  chat: { id: string; title: string };
}

const ChatListItem = ({ chat }: ChatListItemProps) => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent navigation when clicking delete

    const result = await dispatch(deleteChat(chat.id));
    if (deleteChat.fulfilled.match(result)) {
      navigate("/");
    }
  };

  return (
    <ListItem
      sx={{
        display: "flex",
        justifyContent: "space-between",
        cursor: "pointer",
        "&:hover": { bgcolor: "action.hover" },
      }}
      onClick={() => navigate(`/chat/${chat.id}`)}
    >
      <ListItemText primary={chat.title} />
      <IconButton onClick={handleDelete} sx={{ color: "error.main" }}>
        <DeleteIcon />
      </IconButton>
    </ListItem>
  );
};

export default ChatListItem;
