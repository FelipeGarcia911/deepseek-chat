import "@chat-app/shared";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import type { AppConfig } from "./config";
import ChatController, { type ChatControllerDependencies } from "./controllers/ChatController";
import { createRouter } from "./routes";

export function createApp(
  dependencies: ChatControllerDependencies,
  config: Pick<AppConfig, "nodeEnv" | "corsOrigins">
) {
  const app = express();
  const controller = new ChatController(dependencies);
  app.set("env", config.nodeEnv);

  app.use((req, res, next) => {
    const origin = req.get("Origin");
    if (origin !== undefined && !config.corsOrigins.includes(origin)) {
      res.status(403).json({ error: "Origin is not allowed." });
      return;
    }
    next();
  });
  app.use(cors({ origin: [...config.corsOrigins] }));
  app.use((req, _res, next) => {
    console.log(`📡 ${req.method} ${req.url}`);
    next();
  });
  app.use(express.json());
  app.use("/api", createRouter(controller));

  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(handleError);
  return app;
}
