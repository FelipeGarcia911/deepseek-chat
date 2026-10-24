import express from "express";
import type ChatController from "../controllers/ChatController";
import { createChatRouter } from "./ChatRoutes";

export function createRouter(controller: ChatController) {
  const router = express.Router();
  router.use("/chats", createChatRouter(controller));
  return router;
}
