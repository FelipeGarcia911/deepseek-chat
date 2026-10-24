import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
const configs = ["tsconfig.json", "tsconfig.cjs.json"];

// This package is ESM; only the CommonJS output directory overrides that format.
mkdirSync("dist/cjs", { recursive: true });
writeFileSync("dist/cjs/package.json", JSON.stringify({ type: "commonjs" }) + "\n");

if (process.argv.includes("--watch")) {
  const children = configs.map((config) =>
    spawn(process.execPath, [tsc, "-p", config, "--watch", "--preserveWatchOutput"], {
      stdio: "inherit",
    }),
  );
  let stopping = false;
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const child of children) child.kill("SIGTERM");
  };
  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));
  for (const child of children) {
    child.on("error", (error) => {
      console.error(error);
      stop(1);
    });
    child.on("exit", (code) => {
      if (!stopping) stop(code || 1);
    });
  }
} else {
  for (const config of configs) {
    const result = spawnSync(process.execPath, [tsc, "-p", config], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
