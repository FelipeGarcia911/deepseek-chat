import express from "express";
import ChatController from "../controllers/ChatController";

const router = express.Router();

router.get("/list", ChatController.getChats);
router.post("/new", ChatController.createChat);

router.get("/:chatId/history", ChatController.getChatHistory);
router.post("/:chatId/message", ChatController.sendMessage);

router.delete("/:chatId", ChatController.deleteChat);

export default router;
