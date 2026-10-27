import { List, CircularProgress, Box } from "@mui/material";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import ChatListItem from "./ChatListItem";

const ChatList = () => {
  const { chats, isLoadingChats } = useSelector((state: RootState) => state.chat);

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
    </Box>
  );
};

export default ChatList;
