import express from "express";
import { ChatParams, CreateChatRequest, SendMessageRequest } from "@chat-app/shared";
import type ChatController from "../controllers/ChatController";
import { handle, validate } from "../http";

export function createChatRouter(controller: ChatController) {
  const router = express.Router();

  router.get("/list", handle(controller.getChats));
  router.post("/new", validate({ body: CreateChatRequest }), handle(controller.createChat));
  router.get("/:chatId/history", validate({ params: ChatParams }), handle(controller.getChatHistory));
  router.post(
    "/:chatId/message",
    validate({ params: ChatParams, body: SendMessageRequest }),
    handle(controller.sendMessage)
  );
  router.delete("/:chatId", validate({ params: ChatParams }), handle(controller.deleteChat));

  return router;
}
