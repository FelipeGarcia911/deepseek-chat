import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { assemblePrompt, runtimePolicy, type PromptHistoryMessage, type PromptTarget } from "../src/runtime/prompt";

const version: PromptTarget = {
  kind: "version",
  assistantVersionId: "version-1",
  instructions: "  Answer in Spanish.  ",
};
const history: readonly PromptHistoryMessage[] = Object.freeze([
  Object.freeze({ id: "m-1", role: "user", content: "Hola" }),
  Object.freeze({ id: "m-2", role: "assistant", content: "¡Hola! ¿En qué ayudo?" }),
  Object.freeze({ id: "m-3", role: "user", content: "Resume esto" }),
]);

describe("prompt assembly", () => {
  it("should start with one system message holding the runtime policy and the trimmed instructions", () => {
    const { messages } = assemblePrompt(version, history);
    assert.deepEqual(messages[0], {
      role: "system",
      content: `${runtimePolicy.text}\n\n## Assistant instructions\nAnswer in Spanish.`,
    });
    assert.equal(messages.filter((message) => message.role === "system").length, 1);
  });

  it("should keep the system message with only the policy when instructions are blank", () => {
    const { messages } = assemblePrompt({ ...version, instructions: "   " }, []);
    assert.deepEqual(messages, [{ role: "system", content: runtimePolicy.text }]);
  });

  it("should preserve the exact roles, order and content of the history without copying identifiers", () => {
    const { messages } = assemblePrompt(version, history);
    assert.deepEqual(messages.slice(1), [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "¡Hola! ¿En qué ayudo?" },
      { role: "user", content: "Resume esto" },
    ]);
  });

  it("should never mutate or reuse the stored history objects", () => {
    const snapshot = structuredClone(history);
    const { messages } = assemblePrompt(version, history);
    messages[1].content = "Changed by a caller";
    assert.deepEqual(history, snapshot);
    assert.ok(messages.slice(1).every((message, index) => message !== history[index]));
  });

  it("should trace the policy version, target and message identifiers with a stable fingerprint", () => {
    const first = assemblePrompt(version, history);
    const again = assemblePrompt(version, [...history]);
    assert.deepEqual(first.trace, {
      policyVersion: "runtime-policy/1",
      target: { kind: "version", assistantVersionId: "version-1" },
      messageIds: ["m-1", "m-2", "m-3"],
      fingerprint: again.trace.fingerprint,
    });
    assert.match(first.trace.fingerprint, /^[0-9a-f]{64}$/);
    const edited = assemblePrompt(version, [...history.slice(0, 2), { id: "m-3", role: "user", content: "Otra cosa" }]);
    assert.notEqual(edited.trace.fingerprint, first.trace.fingerprint);
  });

  it("should trace draft previews by their captured revision", () => {
    const { trace } = assemblePrompt({ kind: "draft_snapshot", draftRevision: 4, instructions: "Draft" }, []);
    assert.deepEqual(trace.target, { kind: "draft_snapshot", draftRevision: 4 });
  });
});
