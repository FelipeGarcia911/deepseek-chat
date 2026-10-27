import express from "express";
import type HealthController from "../controllers/HealthController";
import { handle } from "../http";

export function createHealthRouter(controller: HealthController) {
  const router = express.Router();
  router.get("/live", handle(controller.live));
  router.get("/ready", handle(controller.ready));
  return router;
}
