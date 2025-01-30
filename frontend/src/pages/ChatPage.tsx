import { useParams } from "react-router-dom";
import Chat from "../components/Chat";

const ChatPage = () => {
  const { id } = useParams<{ id: string }>();

  return <Chat id={id} />;
};

export default ChatPage;
