import express from "express";
import chatRoutes from "./ChatRoutes";

const router = express.Router();

router.use("/chats", chatRoutes);

export default router;
