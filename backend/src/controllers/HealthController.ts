import { Request, Response } from "express";
import { sendProblem } from "../http";
import type HealthService from "../services/HealthService";

export interface HealthControllerDependencies {
  healthService: Pick<HealthService, "checkReadiness">;
}

class HealthController {
  constructor(private readonly dependencies: HealthControllerDependencies) {}

  live = async (_req: Request, res: Response): Promise<void> => {
    res.json({ status: "ok" });
  };

  ready = async (_req: Request, res: Response): Promise<void> => {
    const readiness = await this.dependencies.healthService.checkReadiness();
    if (readiness.ready) res.json({ status: "ready" });
    else sendProblem(res, "DEPENDENCY_UNAVAILABLE", readiness.reason);
  };
}

export default HealthController;
