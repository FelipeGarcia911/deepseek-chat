import "@chat-app/ui";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "./store";
import Layout from "./components/Layout";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ChatPage from "./pages/ChatPage";
import { fetchChats } from "./store/reducers/Chat";
import { ThemeProvider, CssBaseline } from "@mui/material";
import useAutoTheme from "./hooks/useTheme";

function App() {
  const dispatch = useDispatch<AppDispatch>();

  const { theme } = useAutoTheme();

  useEffect(() => {
    dispatch(fetchChats());
  }, [dispatch]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="chat/:id" element={<ChatPage />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
