import express from "express";
import ChatController from "../controllers/ChatController";

const router = express.Router();

// 📌 Rutas de gestión de chats
router.get("/list", ChatController.getChats);
router.post("/new", ChatController.createChat);

// 📌 Rutas para mensajes dentro de un chat específico
router.get("/:chatId/history", ChatController.getChatHistory);
router.post("/:chatId/message", ChatController.sendMessage);

export default router;
