import express from "express";
import {
  AssistantParams,
  ConversationParams,
  CreateConversationRequest,
  PageQuery,
  SendMessageRequest,
} from "@chat-app/shared";
import type ConversationController from "../controllers/ConversationController";
import { handle, validate } from "../http";

function createAdminRouter(controller: ConversationController) {
  const router = express.Router();
  router.get("/conversations", validate({ query: PageQuery }), handle(controller.listConversations));
  router.delete(
    "/conversations/:conversationId",
    validate({ params: ConversationParams }),
    handle(controller.deleteConversation)
  );
  return router;
}

function createRuntimeRouter(controller: ConversationController) {
  const router = express.Router();
  router.post(
    "/assistants/:assistantSlug/conversations",
    validate({ params: AssistantParams, body: CreateConversationRequest }),
    handle(controller.createConversation)
  );
  router.get(
    "/conversations/:conversationId/messages",
    validate({ params: ConversationParams, query: PageQuery }),
    handle(controller.listMessages)
  );
  router.post(
    "/conversations/:conversationId/messages",
    validate({ params: ConversationParams, body: SendMessageRequest }),
    handle(controller.sendMessage)
  );
  return router;
}

export function createRouter(controller: ConversationController) {
  const router = express.Router();
  router.use("/v1/admin", createAdminRouter(controller));
  router.use("/v1/runtime", createRuntimeRouter(controller));
  return router;
}
