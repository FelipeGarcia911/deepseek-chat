import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import ts from "typescript";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const nodeNames = ["process", "Buffer", "require", "__dirname"];

it("should reject Node globals in browser and UI source while allowing them in Node scopes", async () => {
  const eslint = new ESLint({ cwd: root });
  const source = "export const probe = [process, Buffer, require, __dirname];";
  for (const filePath of ["frontend/src/probe.ts", "packages/ui/src/probe.tsx"]) {
    const config = await eslint.calculateConfigForFile(filePath);
    for (const name of nodeNames) expect(config.languageOptions.globals[name]).toBeUndefined();
    const [result] = await eslint.lintText(source, { filePath });
    expect(result.messages.map((message) => message.ruleId)).toEqual(Array(4).fill("no-restricted-globals"));
  }
  for (const filePath of [
    "backend/src/probe.ts",
    "packages/shared/scripts/probe.mjs",
    "frontend/vite.config.ts",
    "frontend/test/probe.ts",
    "frontend/src/store/probe.test.ts",
  ]) {
    const [result] = await eslint.lintText(source, { filePath });
    expect(result.messages).toEqual([]);
    const config = await eslint.calculateConfigForFile(filePath);
    for (const name of nodeNames) expect(config.languageOptions.globals[name]).toBeDefined();
  }
  const shared = await eslint.calculateConfigForFile("packages/shared/src/probe.ts");
  for (const name of nodeNames) expect(shared.languageOptions.globals?.[name]).toBeUndefined();
});

it("should reject Node ambient types in the browser build without importing test types", () => {
  const directory = path.join(root, "frontend");
  const configFile = ts.readConfigFile(path.join(directory, "tsconfig.app.json"), ts.sys.readFile);
  expect(configFile.error).toBeUndefined();
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, directory);
  expect(config.errors).toEqual([]);
  expect(config.fileNames.some((file) => /\.test\.tsx?$/.test(file) || file.includes("/src/test/"))).toBe(false);
  const filePath = path.join(directory, "src/probe.ts");
  const host = ts.createCompilerHost(config.options);
  const readSource = host.getSourceFile.bind(host);
  host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) =>
    file === filePath
      ? ts.createSourceFile(file, "export const probe = [process, Buffer, require, __dirname];", ts.ScriptTarget.ES2020)
      : readSource(file, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([...config.fileNames, filePath], config.options, host);
  const messages = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file?.fileName === filePath)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  for (const name of nodeNames) expect(messages.some((message) => message.includes(`'${name}'`))).toBe(true);
}, 20_000);
