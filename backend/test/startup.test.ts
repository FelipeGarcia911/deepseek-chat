import { createServer } from "node:http";
import express from "express";
import dotenv from "dotenv";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApplication } from "../src/composition";
import { main } from "../src/server";

vi.mock("../src/composition", () => ({ createApplication: vi.fn() }));

const application = express();
let server: ReturnType<typeof createServer>;
let originalTerm: ((signal: "SIGTERM") => void)[];
let originalInt: ((signal: "SIGINT") => void)[];
const originalExitCode = process.exitCode;

let closeApplication: ReturnType<typeof vi.fn<() => Promise<void>>>;

beforeEach(() => {
  originalTerm = process.listeners("SIGTERM");
  originalInt = process.listeners("SIGINT");
  vi.useFakeTimers();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PORT", "4000");
  vi.stubEnv("CORS_ORIGINS", "http://localhost:5173");
  vi.stubEnv("CHAT_STORAGE_PATH", "./data/chats.json");
  vi.stubEnv("DATABASE_URL", "postgres://chat_app:chat_app@127.0.0.1:5432/chat_app");
  vi.spyOn(dotenv, "config").mockReturnValue({ parsed: {} });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  server = createServer();
  vi.spyOn(application, "listen").mockReturnValue(server);
  closeApplication = vi.fn(async () => {});
  vi.mocked(createApplication).mockResolvedValue({ app: application, close: closeApplication });
});

afterEach(() => {
  for (const listener of process.listeners("SIGTERM"))
    if (!originalTerm.includes(listener)) process.removeListener("SIGTERM", listener);
  for (const listener of process.listeners("SIGINT"))
    if (!originalInt.includes(listener)) process.removeListener("SIGINT", listener);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  process.exitCode = originalExitCode;
});

function signal(name: "SIGTERM" | "SIGINT") {
  const originals = [...originalTerm, ...originalInt];
  const listener = process.listeners(name).find((candidate) => !originals.includes(candidate));
  expect(listener).toBeDefined();
  listener!(name);
}

it.each(["SIGTERM", "SIGINT"] as const)("should close once and remove shutdown resources after %s", async (name) => {
  let finish: ((error?: Error) => void) | undefined;
  const close = vi.spyOn(server, "close").mockImplementation((callback) => {
    finish = callback;
    return server;
  });
  await main();
  const listening = vi.mocked(application.listen).mock.calls[0].at(-1);
  expect(typeof listening).toBe("function");
  if (typeof listening === "function") listening();
  expect(console.log).toHaveBeenCalledWith("Server running on http://localhost:4000");
  signal(name);
  signal(name);
  expect(close).toHaveBeenCalledOnce();
  expect(closeApplication).not.toHaveBeenCalled();
  await finish!();
  expect(closeApplication).toHaveBeenCalledOnce();
  expect(console.log).toHaveBeenCalledWith("Database connections closed");
  expect(process.listeners(name)).toEqual(name === "SIGTERM" ? originalTerm : originalInt);
  expect(vi.getTimerCount()).toBe(0);
});

it("should log the actual listening port and report HTTP and database close failures", async () => {
  vi.spyOn(server, "address").mockReturnValue({ port: 4500, address: "127.0.0.1", family: "IPv4" });
  let finish: ((error?: Error) => void) | undefined;
  vi.spyOn(server, "close").mockImplementation((callback) => {
    finish = callback;
    return server;
  });
  closeApplication.mockRejectedValue(new Error("Synthetic pool failure"));
  await main();
  const listening = vi.mocked(application.listen).mock.calls[0].at(-1);
  if (typeof listening === "function") listening();
  expect(console.log).toHaveBeenCalledWith("Server running on http://localhost:4500");
  signal("SIGTERM");
  await finish!(new Error("Synthetic close failure"));
  expect(process.exitCode).toBe(1);
  expect(console.error).toHaveBeenCalledWith("Failed to close HTTP server:", expect.any(Error));
  expect(console.error).toHaveBeenCalledWith("Failed to close database connections:", expect.any(Error));
  expect(closeApplication).toHaveBeenCalledOnce();
});

it("should force stalled connections closed at the shutdown deadline", async () => {
  vi.spyOn(server, "close").mockReturnValue(server);
  const closeConnections = vi.spyOn(server, "closeAllConnections").mockImplementation(() => {});
  const exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("Synthetic forced exit");
  });
  await main();
  signal("SIGINT");
  expect(() => vi.advanceTimersByTime(10_000)).toThrow("Synthetic forced exit");
  expect(closeConnections).toHaveBeenCalledOnce();
  expect(exit).toHaveBeenCalledWith(1);
});

it("should report listener errors and remove signal handlers", async () => {
  await main();
  server.emit("error", new Error("Synthetic listener failure"));
  expect(process.exitCode).toBe(1);
  expect(process.listeners("SIGTERM")).toEqual(originalTerm);
  expect(console.error).toHaveBeenCalledWith("Failed to start HTTP server:", expect.any(Error));
});

it("should allow a missing env file but reject unreadable configuration before composition", async () => {
  vi.spyOn(server, "close").mockReturnValue(server);
  vi.mocked(dotenv.config).mockReturnValue({ error: Object.assign(new Error("Missing"), { code: "ENOENT" }) });
  await main();
  expect(createApplication).toHaveBeenCalledOnce();
  vi.mocked(dotenv.config).mockReturnValue({ error: Object.assign(new Error("Denied"), { code: "EACCES" }) });
  await expect(main()).rejects.toThrow("could not be read");
  expect(createApplication).toHaveBeenCalledOnce();
});
