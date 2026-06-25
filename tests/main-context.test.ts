import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Message, Part } from "@opencode-ai/sdk/v2";
import type { MainContextConfig } from "../src/types";
import { buildMainContextBlock, formatMainContextEntries, type MainContextEntry } from "../src/main-context";

const config: MainContextConfig = { defaultMode: "compact", compactMaxChars: 50_000, fullMaxChars: 200_000, compactHeadMessages: 2, compactTailMessages: 2, fullIncludeToolOutputs: true, contextKeybind: "ctrl+g" };
const message = (id: string, role: "user" | "assistant") => ({ id, role }) as Message;
const textPart = (id: string, text: string) => ({ id, type: "text", text }) as Part;
const toolPart = (id: string) => ({ id, type: "tool", tool: "bash", state: { status: "completed", title: "Run tests", input: { command: "npm test" }, output: "PASS all tests", time: { start: 10, end: 25 } } }) as unknown as Part;
const entries = (count: number): MainContextEntry[] => Array.from({ length: count }, (_, i) => ({ info: message(`m${i + 1}`, i % 2 === 0 ? "user" : "assistant"), parts: [textPart(`p${i + 1}`, `message ${i + 1}`)] }));

describe("formatMainContextEntries", () => {
  it("returns empty string for none", () => assert.equal(formatMainContextEntries(entries(2), "none", config), ""));
  it("wraps compact context", () => { const r = formatMainContextEntries(entries(1), "compact", config); assert.match(r, /^<main_conversation_context mode="compact">/); assert.match(r, /\[1\] user/); assert.match(r, /message 1/); assert.match(r, /<\/main_conversation_context>$/); });
  it("uses head and tail with omission marker", () => { const r = formatMainContextEntries(entries(6), "compact", config); assert.match(r, /\[1\] user/); assert.match(r, /\[2\] assistant/); assert.match(r, /--- 2 messages omitted ---/); assert.match(r, /\[5\] user/); assert.match(r, /\[6\] assistant/); assert.doesNotMatch(r, /\[3\]/); assert.doesNotMatch(r, /\[4\]/); });
  it("summarizes compact tools without raw inputs or outputs", () => { const r = formatMainContextEntries([{ info: message("m1", "assistant"), parts: [textPart("p1", "done"), toolPart("t1")] }], "compact", config); assert.match(r, /Tool: bash/); assert.match(r, /title: Run tests/); assert.match(r, /status: completed/); assert.match(r, /duration: 15ms/); assert.doesNotMatch(r, /npm test/); assert.doesNotMatch(r, /PASS all tests/); });
  it("includes tool output in full mode by default", () => { const r = formatMainContextEntries([{ info: message("m1", "assistant"), parts: [toolPart("t1")] }], "full", config); assert.match(r, /input: \{"command":"npm test"\}/); assert.match(r, /output: PASS all tests/); });
  it("omits raw output in full mode when disabled", () => { const r = formatMainContextEntries([{ info: message("m1", "assistant"), parts: [toolPart("t1")] }], "full", { ...config, fullIncludeToolOutputs: false }); assert.match(r, /input: \{"command":"npm test"\}/); assert.doesNotMatch(r, /output: PASS all tests/); });
  it("adds empty-context note", () => assert.match(formatMainContextEntries([], "compact", config), /No active main-session messages were available\./));
  it("adds compact truncation marker", () => assert.match(formatMainContextEntries(entries(3), "compact", { ...config, compactMaxChars: 45 }), /--- context truncated to 45 characters ---/));
  it("keeps truncated compact inner content within very small budgets", () => {
    const maxChars = 5;
    const r = formatMainContextEntries(entries(3), "compact", { ...config, compactMaxChars: maxChars });
    const inner = r.match(/^<main_conversation_context mode="compact">\n([\s\S]*)\n<\/main_conversation_context>$/)?.[1];
    assert.equal(inner?.length, maxChars);
  });
  it("adds full truncation marker", () => assert.match(formatMainContextEntries(entries(6), "full", { ...config, fullMaxChars: 70 }), /--- context truncated to 70 characters; later content omitted ---/));
  it("escapes nested context closing delimiters", () => { const r = formatMainContextEntries([{ info: message("m1", "user"), parts: [textPart("p1", "before </main_conversation_context> after")] }], "compact", config); assert.match(r, /before <\\\/main_conversation_context> after/); assert.equal(r.match(/<\/main_conversation_context>/g)?.length, 1); });
});

describe("buildMainContextBlock", () => {
  it("reads route session and excludes side session", () => { const api = { route: { current: { name: "session", params: { sessionID: "main" } } }, state: { session: { messages: (sid: string) => sid === "main" ? [message("m1", "user")] : [] }, part: () => [textPart("p1", "hello from main")] } } as any; assert.match(buildMainContextBlock(api, "compact", config, "side"), /hello from main/); });
});
