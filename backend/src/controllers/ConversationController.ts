import { Request, Response } from "express";
import {
  AssistantParams,
  ConversationPage,
  ConversationParams,
  ConversationSummary,
  CreateConversationRequest,
  MessagePage,
  PageQuery,
  SendMessageRequest,
  MessageStreamEvent,
} from "@chat-app/shared";
import { abortOnClose, parse, writeEventStream } from "../http";
import type ChatRuntimeService from "../runtime/ChatRuntimeService";
import type ConversationService from "../services/ConversationService";

export interface ConversationControllerDependencies {
  conversationService: Pick<
    ConversationService,
    "listConversations" | "createConversation" | "listMessages" | "deleteConversation"
  >;
  chatRuntime: Pick<ChatRuntimeService, "sendMessage">;
}

class ConversationController {
  constructor(private readonly dependencies: ConversationControllerDependencies) {}

  listConversations = async (req: Request, res: Response): Promise<void> => {
    const query = parse(PageQuery, req.query, "query");
    res.json(ConversationPage.parse(await this.dependencies.conversationService.listConversations(query)));
  };

  createConversation = async (req: Request, res: Response): Promise<void> => {
    const { assistantSlug } = parse(AssistantParams, req.params, "params");
    const { title } = parse(CreateConversationRequest, req.body, "body");
    const conversation = await this.dependencies.conversationService.createConversation(assistantSlug, title);
    res.status(201).json(ConversationSummary.parse(conversation));
  };

  listMessages = async (req: Request, res: Response): Promise<void> => {
    const { conversationId } = parse(ConversationParams, req.params, "params");
    const query = parse(PageQuery, req.query, "query");
    res.json(MessagePage.parse(await this.dependencies.conversationService.listMessages(conversationId, query)));
  };

  sendMessage = async (req: Request, res: Response): Promise<void> => {
    const { conversationId } = parse(ConversationParams, req.params, "params");
    const { content } = parse(SendMessageRequest, req.body, "body");
    const events = await this.dependencies.chatRuntime.sendMessage(conversationId, content, abortOnClose(res));
    await writeEventStream(res, events, MessageStreamEvent);
  };

  deleteConversation = async (req: Request, res: Response): Promise<void> => {
    const { conversationId } = parse(ConversationParams, req.params, "params");
    await this.dependencies.conversationService.deleteConversation(conversationId);
    res.status(204).end();
  };
}

export default ConversationController;
