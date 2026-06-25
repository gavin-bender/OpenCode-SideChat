import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  DEFAULT_ALLOWED_TOOLS,
  DEFAULT_TOKEN_LIMIT,
  DEFAULT_KEYBIND,
  DEFAULT_CLEAR_KEYBIND,
  DEFAULT_THINK_TOGGLE_KEYBIND,
  DEFAULT_HISTORY_KEYBIND,
  DEFAULT_DELETE_KEYBIND,
  DEFAULT_MODEL_KEYBIND,
  DEFAULT_CONTEXT_KEYBIND,
  DEFAULT_MAIN_CONTEXT_MODE,
  DEFAULT_COMPACT_MAX_CHARS,
  DEFAULT_FULL_MAX_CHARS,
  DEFAULT_COMPACT_HEAD_MESSAGES,
  DEFAULT_COMPACT_TAIL_MESSAGES,
  DEFAULT_FULL_INCLUDE_TOOL_OUTPUTS,
  DEFAULT_WIDTH,
  DEFAULT_POSITION,
  DEFAULT_SYSTEM_PROMPT,
} from "./constants";
import type { MainContextConfig, MainContextMode, SideConfig, ThinkConfig } from "./types";

const VALID_POSITIONS = new Set(["bottom-right", "bottom-left", "top-right", "top-left"]);

const CONFIG_FILENAME = "sidechat.jsonc";

function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, "opencode");
  return join(homedir(), ".config", "opencode");
}

function configPath(): string {
  return join(configDir(), CONFIG_FILENAME);
}

function stripJsoncComments(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      result += ch;
      if (ch === "\\" && i + 1 < text.length) {
        i += 1;
        result += text[i];
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
        result += ch;
      } else if (ch === "/" && i + 1 < text.length && text[i + 1] === "/") {
        while (i < text.length && text[i] !== "\n") i += 1;
        continue;
      } else if (ch === "/" && i + 1 < text.length && text[i + 1] === "*") {
        i += 2;
        let found = false;
        while (i + 1 < text.length) {
          if (text[i] === "*" && text[i + 1] === "/") { found = true; break; }
          i += 1;
        }
        if (found) i += 2;
        else i = text.length;
        continue;
      } else {
        result += ch;
      }
    }
    i += 1;
  }
  return result;
}

function stripTrailingCommas(text: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      result += ch;
      if (ch === "\\" && i + 1 < text.length) {
        i += 1;
        result += text[i];
      } else if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      i += 1;
      continue;
    }

    if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      if (text[j] === "}" || text[j] === "]") {
        i += 1;
        continue;
      }
    }

    result += ch;
    i += 1;
  }
  return result;
}

function generateDefaultConfig(): string {
  const defaultAllowedTools = JSON.stringify(DEFAULT_ALLOWED_TOOLS);
  return `{
  // OpenCode SideChat Configuration
  // Keybinds default: ${DEFAULT_KEYBIND} (toggle), ${DEFAULT_CLEAR_KEYBIND} (clear), ${DEFAULT_THINK_TOGGLE_KEYBIND} (think), ${DEFAULT_HISTORY_KEYBIND} (history), ${DEFAULT_DELETE_KEYBIND} (delete), ${DEFAULT_MODEL_KEYBIND} (model), ${DEFAULT_CONTEXT_KEYBIND} (context)
  // Override any keybind by adding it here (e.g. "keybind": "ctrl+s"). Set to false or "none" to disable.
  "model": null,
  "systemPrompt": ${JSON.stringify(DEFAULT_SYSTEM_PROMPT)},
  "allowedTools": ${defaultAllowedTools},
  "width": ${DEFAULT_WIDTH},
  "tokenLimit": ${DEFAULT_TOKEN_LIMIT},
  "think": {
    "defaultState": "collapsed",
    "showSummary": false
  },
  "position": "bottom-right",
  "mainContext": {
    "defaultMode": "compact",
    "compactMaxChars": ${DEFAULT_COMPACT_MAX_CHARS},
    "fullMaxChars": ${DEFAULT_FULL_MAX_CHARS},
    "compactHeadMessages": ${DEFAULT_COMPACT_HEAD_MESSAGES},
    "compactTailMessages": ${DEFAULT_COMPACT_TAIL_MESSAGES},
    "fullIncludeToolOutputs": ${DEFAULT_FULL_INCLUDE_TOOL_OUTPUTS},
    "contextKeybind": "${DEFAULT_CONTEXT_KEYBIND}"
  }
}
`;
}

function ensureConfigFile(): void {
  const dir = configDir();
  const path = configPath();
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(path)) writeFileSync(path, generateDefaultConfig(), "utf-8");
  } catch (err) {
    console.error(`[SideChat] Failed to create config:`, err);
  }
}

export function loadConfig(): SideConfig {
  ensureConfigFile();

  let raw: Record<string, unknown> = {};
  try {
    const text = readFileSync(configPath(), "utf-8");
    const json = stripTrailingCommas(stripJsoncComments(text));
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
  } catch (err) {
    console.warn(`[SideChat] Failed to parse config, using defaults:`, err);
  }

  return {
    model: parseStringOrNull(raw.model),
    systemPrompt: parseString(raw.systemPrompt, DEFAULT_SYSTEM_PROMPT),
    tokenLimit: parsePositiveNumber(raw.tokenLimit, DEFAULT_TOKEN_LIMIT),
    keybind: parseKeybind(raw.keybind, DEFAULT_KEYBIND),
    clearKeybind: parseKeybind(raw.clearKeybind, DEFAULT_CLEAR_KEYBIND),
    thinkToggleKeybind: parseKeybind(raw.thinkToggleKeybind, DEFAULT_THINK_TOGGLE_KEYBIND),
    historyKeybind: parseKeybind(raw.historyKeybind, DEFAULT_HISTORY_KEYBIND),
    deleteKeybind: parseKeybind(raw.deleteKeybind, DEFAULT_DELETE_KEYBIND),
    modelKeybind: parseKeybind(raw.modelKeybind, DEFAULT_MODEL_KEYBIND),
    allowedTools: parseAllowedTools(raw.allowedTools),
    width: parsePositiveNumber(raw.width, DEFAULT_WIDTH),
    position: parsePosition(raw.position),
    think: parseThinkConfig(raw.think),
    mainContext: parseMainContextConfig(raw.mainContext),
  };
}

function parseStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parsePositiveNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function parseKeybind(value: unknown, fallback: string): string | false {
  if (value === false || value === "none") return false;
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parsePosition(value: unknown): string {
  if (typeof value === "string" && VALID_POSITIONS.has(value.trim())) return value.trim();
  return DEFAULT_POSITION;
}

function parseAllowedTools(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((item) => typeof item === "string") ? value : null;
}

function parseThinkConfig(value: unknown): ThinkConfig {
  if (!value || typeof value !== "object") return { defaultState: "collapsed", showSummary: false };
  const obj = value as Record<string, unknown>;
  return {
    defaultState: obj.defaultState === "expanded" ? "expanded" : "collapsed",
    showSummary: obj.showSummary === true,
  };
}

function parseMainContextMode(value: unknown): MainContextMode {
  return value === "full" || value === "none" || value === "compact" ? value : DEFAULT_MAIN_CONTEXT_MODE;
}

function parseBooleanDefaultTrue(value: unknown): boolean {
  return value === false ? false : true;
}

function parseMainContextConfig(value: unknown): MainContextConfig {
  const obj = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    defaultMode: parseMainContextMode(obj.defaultMode),
    compactMaxChars: parsePositiveNumber(obj.compactMaxChars, DEFAULT_COMPACT_MAX_CHARS),
    fullMaxChars: parsePositiveNumber(obj.fullMaxChars, DEFAULT_FULL_MAX_CHARS),
    compactHeadMessages: parsePositiveNumber(obj.compactHeadMessages, DEFAULT_COMPACT_HEAD_MESSAGES),
    compactTailMessages: parsePositiveNumber(obj.compactTailMessages, DEFAULT_COMPACT_TAIL_MESSAGES),
    fullIncludeToolOutputs: parseBooleanDefaultTrue(obj.fullIncludeToolOutputs),
    contextKeybind: parseKeybind(obj.contextKeybind, DEFAULT_CONTEXT_KEYBIND),
  };
}
