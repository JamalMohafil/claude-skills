---
name: claude-arabic
description: One-command setup of "Claude Arabic Terminal" — makes Claude Code render Arabic / Persian / Hebrew / Urdu correctly inside VS Code (connected letters, right-to-left order) on macOS and Windows. Installs a VS Code extension plus an `arabic` launcher so the user can run `arabic claude` (with any Claude flags) and get an Arabic-capable Claude pane in the VS Code terminal area. Use when the user says "claude arabic", "Arabic looks broken / reversed / disconnected in the terminal", "install claude arabic", "RTL in VS Code terminal", or wants Claude Code to show Arabic properly in VS Code.
---

# Claude Arabic Terminal

VS Code's terminal (xterm.js) cannot render right-to-left scripts: Arabic comes out
with disconnected letters and reversed word order, and nothing in settings fixes it.
This skill installs a small VS Code extension that runs Claude Code in a pseudo-terminal,
keeps the screen in a headless terminal emulator, and renders it as HTML inside VS Code
— so the browser engine does the Arabic shaping and bidi, exactly like claude.ai.

Repository: https://github.com/JamalMohafil/claude-arabic-terminal

## Your job

Run the installer for the user's OS, verify it worked, and finish by telling them the
single command they need from now on: **`arabic claude`**.

## Steps

### 1. Check prerequisites (stop and tell the user if one is missing)

- `git`, `node` (18+), `npm` — `git --version`, `node -v`, `npm -v`
- Claude Code CLI — `claude --version`
- VS Code with the `code` CLI — `code --version`
  (if `code` is missing on macOS: VS Code → Cmd+Shift+P → "Shell Command: Install 'code' command in PATH")

### 2. Run the installer

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/JamalMohafil/claude-arabic-terminal/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/JamalMohafil/claude-arabic-terminal/main/install.ps1 | iex
```

The installer clones the repo to `~/.claude-arabic-terminal`, runs `npm install`,
links the extension into `~/.vscode/extensions/`, and puts the `arabic` launcher in
`~/.local/bin` (added to PATH if needed). Re-running it updates an existing install.

If `curl`/`irm` is blocked, clone the repo manually and run `./install.sh` or
`.\install.ps1` from inside it.

### 3. Verify

- `ls ~/.vscode/extensions | grep claude-arabic` (Windows: `dir $env:USERPROFILE\.vscode\extensions`) shows `jamal.claude-arabic-terminal-<version>`
- `command -v arabic` (Windows: `Get-Command arabic`) resolves — if not, the user must open a **new** terminal so PATH refreshes
- `ls ~/.claude-arabic-terminal/node_modules/node-pty/prebuilds` lists `darwin-*` / `win32-*`

### 4. Tell the user exactly this

1. Reload VS Code: **Cmd/Ctrl+Shift+P → "Developer: Reload Window"**
2. From now on, in any VS Code terminal, run:

   ```
   arabic claude
   ```

   Every Claude Code flag passes through unchanged:
   `arabic claude --dangerously-skip-permissions`, `arabic claude --resume`, `arabic claude --model opus`

3. The first launch shows "Allow 'Claude Arabic Terminal' to open this URI?" —
   tick **"Do not ask me again for this extension"** and click **Open**.

Claude Code opens as an Arabic-capable pane inside the VS Code terminal area, running in
the folder the command was launched from.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `arabic: command not found` | Open a new terminal (PATH was just updated), or run `~/.local/bin/arabic claude` |
| URI dialog appears but nothing opens | VS Code hasn't reloaded since install — Developer: Reload Window |
| "claude exited with code 1" immediately | Run `claude` in a normal terminal first to finish login / trust the folder |
| Extension doesn't load on macOS (`posix_spawnp failed`) | `chmod +x ~/.claude-arabic-terminal/node_modules/node-pty/prebuilds/*/spawn-helper` |
| Want it as an editor tab instead of the terminal area | Command Palette → "Claude Arabic Terminal: Open in Editor Tab" |

## Uninstall

```bash
rm -rf ~/.claude-arabic-terminal ~/.vscode/extensions/jamal.claude-arabic-terminal-* ~/.local/bin/arabic
```
