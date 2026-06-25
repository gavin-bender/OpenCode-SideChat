# OpenCode-SideChat

Floating side-chat panel for quick queries while your main session runs.
Opens at the configured position (default bottom-right) via `Alt+N`. Uses a separate
agent with configurable tool access and optional prompt-time main-session context.

https://github.com/user-attachments/assets/9c27927e-6d53-487c-a87e-8912d89b3461

## Install

```bash
npm install -g opencode-sidechat
```

Or add to `~/.config/opencode/tui.json`: `["opencode-sidechat"]`

## Usage

| Keybind | Action |
|---------|--------|
| `Alt+N` | Toggle panel |
| `Alt+C` | Clear chat / new session |
| `Alt+T` | Toggle thinking blocks |
| `Alt+H` | Toggle history viewer |
| `Alt+D` | Delete selected history entry (in history view) |
| `Ctrl+X` | Cycle context mode: Compact → Full → None |
| `Tab` | Change model |

Clickable items in the footer: **Clear**, **Thinking**, **Model**, **Context**, **History** — also work via their respective keybinds when enabled. The footer shows Context: Compact, Context: Full, or Context: None.

## Main-session context modes

SideChat still creates and uses its own separate session. When context mode is `Compact` or `Full`, SideChat reads the active main-session transcript at submit time and appends it to the SideChat system prompt inside `<main_conversation_context mode="compact|full">` delimiters. Switching modes affects the next prompt only; it does not clear SideChat history, recreate the SideChat session, or route prompts through the main agent.

- **Compact** (default): includes earliest configured messages plus most recent configured messages, summarizes tool calls, excludes raw tool outputs, and uses a deterministic character budget.
- **Full**: includes ordered transcript content with tool details and raw tool outputs by default, bounded by a deterministic character budget.
- **None**: omits main-session context and behaves like original isolated SideChat.

## History

SideChat saves your session to disk when you close the panel or clear the chat.
Press `Alt+H` to browse past sessions grouped by date. Click a session to view
the full read-only transcript. Press `Alt+D` or click **Delete** to remove a session.
History is capped at 50 entries (FIFO).

## Configuration

Settings in `~/.config/opencode/sidechat.jsonc`:

```jsonc
{
  "model": null,                     // Model override (null = use default)
  "systemPrompt": "...",             // System prompt for side agent
  "keybind": "alt+n",                // Toggle panel keybind
  "clearKeybind": "alt+c",           // Clear chat keybind
  "thinkToggleKeybind": "alt+t",     // Toggle thinking keybind
  "allowedTools": ["...", "..."],    // Allowed tool IDs
  "width": 70,                       // Panel width (columns)
  "transcriptHeight": 20,            // Transcript height (rows)
  "tokenLimit": 45000,               // Max tokens per session
  "position": "bottom-right",        // Panel position: bottom-right, bottom-left, top-left, top-right
  "think": {
    "defaultState": "collapsed",     // "collapsed" or "expanded"
    "showSummary": false
  },
  "mainContext": {
    "defaultMode": "compact",        // "compact", "full", or "none"
    "compactMaxChars": 50000,         // Character budget for compact context
    "fullMaxChars": 200000,           // Character budget for full context
    "compactHeadMessages": 4,         // Earliest messages included in compact mode
    "compactTailMessages": 20,        // Latest messages included in compact mode
    "fullIncludeToolOutputs": true,   // Include raw tool outputs in full mode
    "contextKeybind": "ctrl+x"        // Set false or "none" to disable keybind only
  }
}
```

### Position options

- `"bottom-right"` — anchored to bottom-right corner (default)
- `"bottom-left"` — anchored to bottom-left corner
- `"top-left"` — anchored to top-left corner
- `"top-right"` — anchored to top-right corner

## Security

Side agent is deny-by-default for tool access. Only tools in `allowedTools` are granted. SideChat uses an isolated session with its own model/tool permissions. Compact mode excludes raw tool outputs; Full mode can include raw main-session tool outputs in the SideChat prompt, so use `fullIncludeToolOutputs: false` or `Context: None` when that context is sensitive.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
