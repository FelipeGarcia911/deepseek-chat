import { Request, Response } from "express";
import {
  ConversationPage,
  ConversationSummary,
  MessagePage,
  type ConversationParams,
  type CreateConversationRequest,
  type PageQuery,
} from "@chat-app/shared";
import { AppError } from "../errors";
import { paginate } from "../http";
import type ConversationService from "../services/ConversationService";

export interface ConversationControllerDependencies {
  conversationService: Pick<
    ConversationService,
    "listConversations" | "createConversation" | "getMessages" | "deleteConversation"
  >;
}

const conversationNotFound = () => new AppError("NOT_FOUND", "Conversation not found.");

class ConversationController {
  constructor(private readonly dependencies: ConversationControllerDependencies) {}

  listConversations = async (req: Request, res: Response): Promise<void> => {
    const conversations = await this.dependencies.conversationService.listConversations();
    res.json(ConversationPage.parse(paginate(conversations, req.query as unknown as PageQuery)));
  };

  createConversation = async (req: Request, res: Response): Promise<void> => {
    const { title } = req.body as CreateConversationRequest;
    const conversation = await this.dependencies.conversationService.createConversation(title);
    res.status(201).json(ConversationSummary.parse(conversation));
  };

  listMessages = async (req: Request, res: Response): Promise<void> => {
    const { conversationId } = req.params as ConversationParams;
    const messages = await this.dependencies.conversationService.getMessages(conversationId);
    if (!messages) throw conversationNotFound();
    res.json(MessagePage.parse(paginate(messages, req.query as unknown as PageQuery)));
  };

  sendMessage = async (req: Request, _res: Response): Promise<void> => {
    const { conversationId } = req.params as ConversationParams;
    if (!(await this.dependencies.conversationService.getMessages(conversationId))) throw conversationNotFound();
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
