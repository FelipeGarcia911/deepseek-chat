import { List, CircularProgress, Box, Button } from "@mui/material";
import { useSelector, useDispatch } from "react-redux";
import { AppDispatch, RootState } from "../../store";
import { createChat } from "../../store/reducers/Chat";
import ChatListItem from "./ChatListItem";

const ChatList = () => {
  const { chats, isLoadingChats } = useSelector((state: RootState) => state.chat);
  const dispatch = useDispatch<AppDispatch>();

  const handleCreateChat = () => {
    dispatch(createChat("New Chat"));
  };

  return (
    <Box sx={{ width: "100%", flexGrow: 1, display: "flex", flexDirection: "column" }}>
      {isLoadingChats ? (
        <CircularProgress sx={{ alignSelf: "center", my: 2 }} />
      ) : (
        <List sx={{ flexGrow: 1, overflowY: "auto" }}>
          {chats.map((chat) => (
            <ChatListItem key={chat.id} chat={chat} />
          ))}
        </List>
      )}

      {/* Create Chat Button at the Bottom */}
      <Button variant="contained" sx={{ my: 2, mx: "auto", width: "90%" }} onClick={handleCreateChat}>
        + New Chat
      </Button>
    </Box>
  );
};

export default ChatList;
