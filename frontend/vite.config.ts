import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { parseFrontendConfig } from "./src/config/schema";

export default defineConfig(({ mode }) => {
  parseFrontendConfig(loadEnv(mode, process.cwd(), "VITE_"));
  return { plugins: [react()] };
});
