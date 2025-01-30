import { useEffect } from "react";
import { useDispatch } from "react-redux";
import Layout from "./components/Layout";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ChatPage from "./pages/ChatPage";
import { fetchChats } from "./store/reducers/Chat";

function App() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchChats());
  }, [dispatch]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="chat/:id" element={<ChatPage />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
