import express from "express";
import cors from "cors";
import type { AppConfig } from "./config";
import ChatController, { type ChatControllerDependencies } from "./controllers/ChatController";
import { assignRequestId, handleError, notFound, sendProblem } from "./http";
import { createRouter } from "./routes";

export function createApp(
  dependencies: ChatControllerDependencies,
  config: Pick<AppConfig, "nodeEnv" | "corsOrigins">
) {
  const app = express();
  const controller = new ChatController(dependencies);
  app.set("env", config.nodeEnv);

  app.use(assignRequestId);
  app.use((req, res, next) => {
    const origin = req.get("Origin");
    if (origin !== undefined && !config.corsOrigins.includes(origin)) {
      sendProblem(res, "ORIGIN_NOT_ALLOWED", "This origin may not call the API.");
      return;
    }
    next();
  });
  app.use(cors({ origin: [...config.corsOrigins], exposedHeaders: ["X-Request-Id"] }));
  app.use((req, _res, next) => {
    console.log(`📡 ${req.method} ${req.url}`);
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", createRouter(controller));
  app.use(notFound);
  app.use(handleError);
  return app;
}
