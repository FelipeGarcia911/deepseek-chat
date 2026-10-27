import { Request, Response } from "express";
import {
  ConversationPage,
  ConversationSummary,
  MessagePage,
  type AssistantParams,
  type ConversationParams,
  type CreateConversationRequest,
  type PageQuery,
} from "@chat-app/shared";
import { AppError } from "../errors";
import type ConversationService from "../services/ConversationService";

export interface ConversationControllerDependencies {
  conversationService: Pick<
    ConversationService,
    "listConversations" | "createConversation" | "getConversation" | "listMessages" | "deleteConversation"
  >;
}

const conversationNotFound = () => new AppError("NOT_FOUND", "Conversation not found.");

class ConversationController {
  constructor(private readonly dependencies: ConversationControllerDependencies) {}

  listConversations = async (req: Request, res: Response): Promise<void> => {
    const page = await this.dependencies.conversationService.listConversations(req.query as unknown as PageQuery);
    res.json(ConversationPage.parse(page));
  };

  createConversation = async (req: Request, res: Response): Promise<void> => {
    const { assistantSlug } = req.params as AssistantParams;
    const { title } = req.body as CreateConversationRequest;
    const conversation = await this.dependencies.conversationService.createConversation(assistantSlug, title);
    res.status(201).json(ConversationSummary.parse(conversation));
  };

  listMessages = async (req: Request, res: Response): Promise<void> => {
    const { conversationId } = req.params as ConversationParams;
    const page = await this.dependencies.conversationService.listMessages(
      conversationId,
      req.query as unknown as PageQuery
    );
    if (!page) throw conversationNotFound();
    res.json(MessagePage.parse(page));
  };

  sendMessage = async (req: Request, _res: Response): Promise<void> => {
    const { conversationId } = req.params as ConversationParams;
    const conversation = await this.dependencies.conversationService.getConversation(conversationId);
    if (!conversation) throw conversationNotFound();
    if (conversation.status !== "open") throw new AppError("INVALID_STATE", "The conversation is closed.");
    throw new AppError("MODEL_NOT_CONFIGURED", "No Model Profile has been configured.");
  };

  deleteConversation = async (req: Request, res: Response): Promise<void> => {
    const { conversationId } = req.params as ConversationParams;
    if (!(await this.dependencies.conversationService.deleteConversation(conversationId))) {
      throw conversationNotFound();
    }
    res.status(204).end();
  };
}

export default ConversationController;
