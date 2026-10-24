import "@chat-app/shared";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import ChatController, { type ChatControllerDependencies } from "./controllers/ChatController";
import { createRouter } from "./routes";

export function createApp(dependencies: ChatControllerDependencies) {
  const app = express();
  const controller = new ChatController(dependencies);

  app.use(express.json());
  app.use(cors({ origin: "*" }));
  app.use((req, _res, next) => {
    console.log(`📡 ${req.method} ${req.url}`);
    next();
  });
  app.use("/api", createRouter(controller));

  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(handleError);

  return app;
}
