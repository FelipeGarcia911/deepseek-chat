import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"] },
  {
    files: ["**/*.{ts,tsx,mts,mjs,js}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  {
    files: [
      "backend/**/*.{ts,mts,mjs,js}",
      "scripts/**/*.{ts,mts,mjs,js}",
      "packages/*/scripts/**/*.{ts,mts,mjs,js}",
      "**/*.config.{ts,mts,mjs,js}",
      "frontend/test/**/*.ts",
      "frontend/src/store/**/*.test.ts",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["frontend/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
    ignores: ["frontend/src/store/**/*.test.ts"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      "no-restricted-globals": ["error", ...Object.keys(globals.node).filter((name) => !(name in globals.browser))],
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  }
);
