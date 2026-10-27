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
  SendMessageResponse,
} from "@chat-app/shared";
import { parse } from "../http";
import type ConversationService from "../services/ConversationService";

export interface ConversationControllerDependencies {
  conversationService: Pick<
    ConversationService,
    "listConversations" | "createConversation" | "listMessages" | "sendMessage" | "deleteConversation"
  >;
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
    const response = await this.dependencies.conversationService.sendMessage(conversationId, content);
    res.status(201).json(SendMessageResponse.parse(response));
  };

  deleteConversation = async (req: Request, res: Response): Promise<void> => {
    const { conversationId } = parse(ConversationParams, req.params, "params");
    await this.dependencies.conversationService.deleteConversation(conversationId);
    res.status(204).end();
  };
}

export default ConversationController;
