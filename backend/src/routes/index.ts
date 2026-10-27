import express from "express";
import type ConversationController from "../controllers/ConversationController";
import { handle } from "../http";

function createAdminRouter(controller: ConversationController) {
  const router = express.Router();
  router.get("/conversations", handle(controller.listConversations));
  router.delete("/conversations/:conversationId", handle(controller.deleteConversation));
  return router;
}

function createRuntimeRouter(controller: ConversationController) {
  const router = express.Router();
  router.post("/assistants/:assistantSlug/conversations", handle(controller.createConversation));
  router.get("/conversations/:conversationId/messages", handle(controller.listMessages));
  router.post("/conversations/:conversationId/messages", handle(controller.sendMessage));
  return router;
}

export function createRouter(controller: ConversationController) {
  const router = express.Router();
  router.use("/v1/admin", createAdminRouter(controller));
  router.use("/v1/runtime", createRuntimeRouter(controller));
  return router;
}
