import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { expect, it } from "vitest";
import { ApiError, send, toApiError } from "../src/services/ApiError";

function axiosErrorWith(data: unknown, status = 400) {
  const config = { headers: new AxiosHeaders() };
  const response = { data, status, statusText: "", headers: {}, config } as AxiosResponse;
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, undefined, response);
}

const problem = {
  type: "about:blank",
  title: "Bad Request",
  status: 400,
  code: "VALIDATION_FAILED",
  detail: "The request contains invalid fields.",
  requestId: "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47",
  errors: [{ path: "body.title", message: "Too big" }],
};

it("should turn a known problem response into an ApiError that keeps the request id for support", () => {
  const original = axiosErrorWith(problem);
  const error = toApiError(original);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ message: problem.detail, problem, cause: original });
  expect((error as ApiError).problem.requestId).toBe(problem.requestId);
});

it("should accept problem codes the client does not know yet", () => {
  const future = { type: "about:blank", title: "Conflict", status: 409, code: "FUTURE_CODE", requestId: "r-1" };
  const error = toApiError(axiosErrorWith(future, 409));
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ message: "Conflict", problem: { code: "FUTURE_CODE", status: 409 } });
});

it("should preserve the original error when the response is not a problem", () => {
  for (const data of [{ error: "Legacy body" }, { ...problem, requestId: undefined }, "<html>", undefined]) {
    const original = axiosErrorWith(data, 502);
    expect(toApiError(original)).toBe(original);
  }
  const network = new Error("Synthetic network failure");
  expect(toApiError(network)).toBe(network);
});

it("should resolve successful requests and reject failures through the adapter", async () => {
  await expect(send(Promise.resolve("value"))).resolves.toBe("value");
  await expect(send(Promise.reject(axiosErrorWith(problem)))).rejects.toBeInstanceOf(ApiError);
});
