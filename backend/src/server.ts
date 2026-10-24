import dotenv from "dotenv";
import { createApplication } from "./composition";

async function main() {
  dotenv.config();
  const app = await createApplication();
  const port = process.env.PORT || 4000;
  const server = app.listen(port, () => {
    const address = server.address();
    const listeningPort = typeof address === "object" && address ? address.port : port;
    console.log(`Server running on http://localhost:${listeningPort}`);
  });

  let stopping = false;
  let shutdownTimer: NodeJS.Timeout | undefined;
  const onSigterm = () => shutdown("SIGTERM");
  const onSigint = () => shutdown("SIGINT");
  const cleanup = () => {
    clearTimeout(shutdownTimer);
    process.removeListener("SIGTERM", onSigterm);
    process.removeListener("SIGINT", onSigint);
  };

  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received: closing HTTP server`);
    shutdownTimer = setTimeout(() => {
      console.error("HTTP shutdown exceeded 10 seconds; forcing exit");
      server.closeAllConnections();
      process.exit(1);
    }, 10_000);
    shutdownTimer.unref();
    server.close((error) => {
      cleanup();
      if (error) {
        console.error("Failed to close HTTP server:", error);
        process.exitCode = 1;
        return;
      }
      console.log("HTTP server closed");
    });
  };

  process.once("SIGTERM", onSigterm);
  process.once("SIGINT", onSigint);
  server.once("error", (error) => {
    cleanup();
    console.error("Failed to start HTTP server:", error);
    process.exitCode = 1;
  });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error("Failed to start server:", error);
    process.exitCode = 1;
  });
}
