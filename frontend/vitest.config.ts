import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/**/*.test.{ts,tsx}", "src/test/**"],
      reporter: ["text", "json-summary", "html"],
      thresholds: { perFile: true, statements: 90, branches: 90, functions: 90, lines: 90 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["test/**/*.test.ts", "src/store/**/*.test.ts"],
          env: { VITE_API_BASE_URL: "/api" },
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test/setup.ts"],
          env: { VITE_API_BASE_URL: "/api" },
        },
      },
    ],
  },
});
