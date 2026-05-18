# `@hashi-mcp/example-obs-bridge`

> Hashi bridge for **OBS Studio** via the [obs-websocket](https://github.com/obsproject/obs-websocket) plugin (bundled with OBS since 28.0).

This example shows three things:

1. How to wrap a host-specific WebSocket library (here `obs-websocket-js`) into a Hashi {@link Transport}.
2. How to expose ten useful tools (scenes, sources, streaming, recording) to Claude through one MCP server.
3. How to ship a runnable bridge that Claude Desktop can spawn over stdio.

## Setup

1. Open OBS Studio 28 or later.
2. Go to **Tools → WebSocket Server Settings**.
3. Tick **Enable WebSocket server**. Click **Generate Password** and copy the value.
4. Click **Apply / OK**. The default endpoint is `ws://127.0.0.1:4455`.

## Run

```bash
# From the repo root
pnpm install
pnpm --filter @hashi-mcp/example-obs-bridge build

# Then start it directly (helpful for debugging)
HASHI_OBS_PASSWORD=your-password node examples/obs-bridge/dist/index.js
```

You'll see it block on stdio waiting for an MCP client.

## Wire to Claude Desktop

Add an entry to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obs": {
      "command": "node",
      "args": ["/absolute/path/to/hashi/examples/obs-bridge/dist/index.js"],
      "env": {
        "HASHI_OBS_PASSWORD": "your-password"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see ten new tools under the `obs` connector.

## Tools

| Tool | What it does |
|------|--------------|
| `obs.scene.list` | List all scenes and the active one. |
| `obs.scene.current` | Get the active scene name. |
| `obs.scene.activate` | Switch to a scene by name. |
| `obs.input.list` | List all sources/inputs. |
| `obs.input.set_visibility` | Show or hide a source in a given scene. |
| `obs.input.set_mute` | Mute or unmute an audio input. |
| `obs.stream.start` | Start streaming. |
| `obs.stream.stop` | Stop streaming. |
| `obs.record.start` | Start recording. |
| `obs.record.stop` | Stop recording, returns the output file path if OBS exposes it. |

## Try it

Once wired in, prompt Claude:

> "List my OBS scenes, switch to my Intro scene, mute my microphone, and start recording."

Claude will chain the four tools in one go.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `HASHI_OBS_ENDPOINT` | `ws://127.0.0.1:4455` | Override the obs-websocket URL |
| `HASHI_OBS_PASSWORD` | _none_ | Password from OBS WebSocket Server Settings |

## License

[MIT](../../LICENSE) © Alexandre Parena
