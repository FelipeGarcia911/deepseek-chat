import express from "express";
import ChatController from "../controllers/ChatController";

const router = express.Router();

router.post("/", ChatController.handleChatRequest);

export default router;
