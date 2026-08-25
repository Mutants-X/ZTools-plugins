# Claude Code Free

ZTools plugin for running Claude Code inside an isolated Node/npm and Claude configuration directory.

## Development

```bash
npm install --registry=https://registry.npmmirror.com/
npm run dev
```

The plugin uses the ZTools Electron preload to download a pinned Node.js runtime on first open. Claude Code and `node-pty` are installed into the ZTools user data directory through `https://registry.npmmirror.com/`; the host machine's Node/npm installation is never modified.

## Build

```bash
npm run build
```

The publishable plugin is `dist/`. It contains the Vite page, `plugin.json`, logo, readable CommonJS preload, and the pure-JavaScript preload dependencies used to extract the private Node archive.

## Runtime data

Runtime files are stored below:

```text
<ZTools userData>/claude-code-free/
```

`CLAUDE_CONFIG_DIR` points to the plugin's private `claude-config` directory. Project-local Claude files in the selected working directory remain active by design.

The plugin stores its session list in `sessions.json`. Each new Claude process is launched with a generated UUID via `--session-id`; reopening a stopped entry launches Claude with `--resume` and the same UUID. The session index contains only plugin metadata, while Claude's conversation data remains in the isolated `claude-config` directory.
