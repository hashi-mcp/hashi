# Hashi

> **Make professional desktop apps speak Claude.**
> 橋 — _hashi_, "bridge" in Japanese.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange)](#roadmap)

The Model Context Protocol (MCP) ecosystem connects Claude to SaaS surfaces — Slack, GitHub, Notion. **Hashi connects Claude to the desktop apps where professional work actually happens**: AEC and CAD (Revit, AutoCAD, Rhino), DCC and 3D (Blender, Houdini, Maya), 2D and creative (Photoshop, Krita, Inkscape), audio production (Reaper, Ableton, Bitwig), streaming and video (OBS, DaVinci Resolve, Premiere), and Office (Excel, Word, PowerPoint).

## Why Hashi

Every existing desktop MCP integration today (BlenderMCP, Figma MCP, custom enterprise plugins) reimplements the same plumbing: localhost transports, plugin-side authentication, lifecycle management, and tool serialization between the host app and the MCP server.

Hashi factors that into a reusable runtime, plus plugin SDKs in **C#, Python, JavaScript, and Lua** for the languages that actually ship inside CAD, DCC, and audio software. Building a Claude bridge for any desktop app drops from ~500 lines of plumbing to ~50 lines of business logic.

## Three things that make Hashi different

1. **Multi-app orchestration** — one prompt, several apps. Read a Revit model, compute costs in Excel, draft an email in Outlook.
2. **AI-native plugin generation** _(coming v0.2)_ — point Hashi at any host SDK's documentation, get a complete bridge package generated for you.
3. **Hashi Studio** _(coming v0.3)_ — a system-tray application with visual control, granular per-tool permissions, and live audit logs for everything Claude touches on your desktop.

## Status

Pre-alpha. Public scaffolding in progress. The first usable release (`v0.1`) ships with `@hashi-mcp/core`, `@hashi-mcp/server`, and `@hashi-mcp/transport-http`, plus an Excel-via-COM example bridge.

## Packages (planned)

| Package | What it does |
|---------|--------------|
| `@hashi-mcp/core` | Runtime types — `Bridge`, `Tool`, `Transport`, `Lifecycle` |
| `@hashi-mcp/server` | Wraps `@modelcontextprotocol/sdk`, exposes Hashi bridges as MCP servers |
| `@hashi-mcp/transport-http` | HTTP/JSON-RPC transport with bearer auth |
| `@hashi-mcp/transport-ws` | WebSocket transport with push events |
| `@hashi-mcp/transport-file` | File-based JSON contract via `%TEMP%` |
| `@hashi-mcp/transport-pipe` | Named pipes (Windows) and Unix sockets |
| `@hashi-mcp/transport-com` | Windows COM/OLE for Office, AutoCAD legacy |
| `@hashi-mcp/cli` | Scaffolder — `npx create-hashi-bridge --target=...` |

Plus host-side plugin SDKs published to their native registries:
- `Hashi.Sdk` (NuGet) for Revit, AutoCAD, Inventor, Rhino plugin authors
- `hashi-sdk` (PyPI) for Blender, Maya, Houdini, Krita
- `hashi-lua` (LuaRocks) for Reaper ReaScript

## Roadmap

| Milestone | Includes |
|-----------|----------|
| **v0.1** | core + server + transport-http + Excel example + CI |
| **v0.2** | Python SDK + Blender example + WebSocket transport + multi-app orchestration POC + scaffolder CLI |
| **v0.3** | C# SDK + Revit example + OBS example + AI-native plugin generation |
| **v1.0** | Hashi Studio (Tauri tray app), stable transports, plugin store |

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Alexandre Parena
