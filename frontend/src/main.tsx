import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { Provider } from "react-redux";
import store from "./store/index.ts";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element in index.html.");

createRoot(container).render(
  <Provider store={store}>
    <App />
  </Provider>
);
