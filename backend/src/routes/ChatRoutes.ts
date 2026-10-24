import express from "express";
import type ChatController from "../controllers/ChatController";

export function createChatRouter(controller: ChatController) {
  const router = express.Router();

  router.get("/list", controller.getChats);
  router.post("/new", controller.createChat);
  router.get("/:chatId/history", controller.getChatHistory);
  router.post("/:chatId/message", controller.sendMessage);
  router.delete("/:chatId", controller.deleteChat);

  return router;
}
