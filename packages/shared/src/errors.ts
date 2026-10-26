import { z } from "zod";

export const errorCatalog = {
  VALIDATION_FAILED: { status: 400, title: "Bad Request" },
  UNAUTHENTICATED: { status: 401, title: "Unauthorized" },
  ORIGIN_NOT_ALLOWED: { status: 403, title: "Forbidden" },
  NOT_FOUND: { status: 404, title: "Not Found" },
  REVISION_CONFLICT: { status: 409, title: "Conflict" },
  INVALID_STATE: { status: 409, title: "Conflict" },
  RUN_IN_PROGRESS: { status: 409, title: "Conflict" },
  REQUEST_IN_PROGRESS: { status: 409, title: "Conflict" },
  PAYLOAD_TOO_LARGE: { status: 413, title: "Content Too Large" },
  IDEMPOTENCY_KEY_REUSED: { status: 422, title: "Unprocessable Content" },
  RATE_LIMITED: { status: 429, title: "Too Many Requests" },
  INTERNAL_ERROR: { status: 500, title: "Internal Server Error" },
  MODEL_NOT_CONFIGURED: { status: 503, title: "Service Unavailable" },
  DEPENDENCY_UNAVAILABLE: { status: 503, title: "Service Unavailable" },
} as const satisfies Record<string, { status: number; title: string }>;

export type ErrorCode = keyof typeof errorCatalog;

export const problemContentType = "application/problem+json";

export const ProblemDetails = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  requestId: z.string(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetails>;
