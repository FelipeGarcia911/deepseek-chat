import axios from "axios";
import { ProblemDetails } from "@chat-app/shared";

export class ApiError extends Error {
  constructor(
    readonly problem: ProblemDetails,
    readonly cause?: unknown
  ) {
    super(problem.detail ?? problem.title);
    this.name = "ApiError";
  }
}

export function toApiError(error: unknown): unknown {
  if (!axios.isAxiosError(error)) return error;
  const problem = ProblemDetails.safeParse(error.response?.data);
  return problem.success ? new ApiError(problem.data, error) : error;
}

export async function send<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    throw toApiError(error);
  }
}
