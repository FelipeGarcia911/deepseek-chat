import express from "express";
import chatRoutes from "./ChatRoutes";

const router = express.Router();

router.use("/chat", chatRoutes);

export default router;
