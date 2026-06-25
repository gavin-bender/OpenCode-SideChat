import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Message, Part } from "@opencode-ai/sdk/v2";
import { extractParts } from "./parts";
import type { MainContextConfig, MainContextMode } from "./types";

export type MainContextEntry = { info: Message; parts: Part[] };
type RouteLike = { name?: string; params?: Record<string, unknown>; sessionID?: unknown; id?: unknown };

export function buildMainContextBlock(api: TuiPluginApi, mode: MainContextMode, config: MainContextConfig, sideSessionID?: string): string {
  if (mode === "none") return "";
  const sessionID = getActiveMainSessionID(api, sideSessionID);
  if (!sessionID) return wrapContext(mode, "No active main-session messages were available.");
  try {
    const messages = api.state.session.messages(sessionID) ?? [];
    return formatMainContextEntries(messages.map((info) => ({ info, parts: [...(api.state.part(info.id) ?? [])] })), mode, config);
  } catch (err) {
    console.warn("[SideChat] Failed to read main session context:", err);
    return wrapContext(mode, "No active main-session messages were available.");
  }
}

export function formatMainContextEntries(entries: MainContextEntry[], mode: MainContextMode, config: MainContextConfig): string {
  if (mode === "none") return "";
  if (entries.length === 0) return wrapContext(mode, "No active main-session messages were available.");
  const inner = mode === "compact" ? formatCompact(entries, config) : formatFull(entries, config);
  const budget = mode === "compact" ? config.compactMaxChars : config.fullMaxChars;
  const marker = mode === "compact" ? `\n--- context truncated to ${budget} characters ---` : `\n--- context truncated to ${budget} characters; later content omitted ---`;
  return wrapContext(mode, limitWithMarker(inner, budget, marker));
}

function getActiveMainSessionID(api: TuiPluginApi, sideSessionID?: string): string | undefined {
  const route = api.route.current as RouteLike;
  if (route.name !== "session") return undefined;
  for (const candidate of [route.params?.sessionID, route.params?.id, route.sessionID, route.id]) {
    if (typeof candidate === "string" && candidate && candidate !== sideSessionID) return candidate;
  }
  return undefined;
}

function formatCompact(entries: MainContextEntry[], config: MainContextConfig): string {
  return compactSelection(entries, config.compactHeadMessages, config.compactTailMessages).map((item) => item.type === "omission" ? `--- ${item.count} messages omitted ---` : formatEntry(item.entry, item.index, false, false)).join("\n\n");
}

function formatFull(entries: MainContextEntry[], config: MainContextConfig): string {
  return entries.map((entry, index) => formatEntry(entry, index + 1, true, config.fullIncludeToolOutputs)).join("\n\n");
}

function compactSelection(entries: MainContextEntry[], headCount: number, tailCount: number): Array<{ type: "entry"; entry: MainContextEntry; index: number } | { type: "omission"; count: number }> {
  if (headCount + tailCount >= entries.length) return entries.map((entry, index) => ({ type: "entry", entry, index: index + 1 }));
  const selected: Array<{ type: "entry"; entry: MainContextEntry; index: number } | { type: "omission"; count: number }> = [];
  for (let index = 0; index < headCount; index += 1) selected.push({ type: "entry", entry: entries[index], index: index + 1 });
  const omitted = entries.length - headCount - tailCount;
  if (omitted > 0) selected.push({ type: "omission", count: omitted });
  for (let index = entries.length - tailCount; index < entries.length; index += 1) selected.push({ type: "entry", entry: entries[index], index: index + 1 });
  return selected;
}

function formatEntry(entry: MainContextEntry, index: number, includeToolInput: boolean, includeToolOutputs: boolean): string {
  const role = entry.info.role === "assistant" ? "assistant" : "user";
  const extracted = extractParts(entry.parts);
  const lines = [`[${index}] ${role}`];
  for (const text of extracted.texts) lines.push(escapeContextText(text));
  for (const tool of extracted.tools) {
    lines.push(`Tool: ${escapeContextText(tool.tool)}`);
    if (tool.title) lines.push(`title: ${escapeContextText(tool.title)}`);
    lines.push(`status: ${escapeContextText(tool.status)}`);
    if (tool.duration !== undefined) lines.push(`duration: ${tool.duration}ms`);
    if (includeToolInput && tool.input !== undefined) lines.push(`input: ${escapeContextText(safeJson(tool.input))}`);
    if (includeToolOutputs && tool.output !== undefined) lines.push(`output: ${escapeContextText(tool.output)}`);
    if (includeToolOutputs && tool.error !== undefined) lines.push(`error: ${escapeContextText(tool.error)}`);
  }
  return lines.join("\n");
}

function escapeContextText(text: string): string { return text.replace(/<\/main_conversation_context>/gi, "<\\/main_conversation_context>"); }
function safeJson(value: unknown): string { try { return JSON.stringify(value); } catch { return "[unserializable input]"; } }
function limitWithMarker(text: string, maxChars: number, marker: string): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  if (marker.length >= maxChars) return marker.slice(0, maxChars);
  return text.slice(0, maxChars - marker.length).trimEnd() + marker;
}
function wrapContext(mode: Exclude<MainContextMode, "none">, inner: string): string { return `<main_conversation_context mode="${mode}">\n${inner}\n</main_conversation_context>`; }
