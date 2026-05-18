# `@hashi-mcp/transport-ws`

> WebSocket/JSON-RPC localhost transport for Hashi bridges. Supports push events via `subscribe`, bearer auth on connect, and token rotation.

## Install

```bash
pnpm add @hashi-mcp/core @hashi-mcp/transport-ws
```

## Usage

```ts
import { defineBridge } from '@hashi-mcp/core'
import { wsTransport } from '@hashi-mcp/transport-ws'

const bridge = defineBridge({
  app: { id: 'my-app', name: 'My App' },
  transport: wsTransport({
    endpoint: 'ws://127.0.0.1:9090',
    token: process.env.HASHI_TOKEN,
  }),
})

await bridge.connect()

// Listen to push events from the host app
const transport = bridge.config.transport
const unsubscribe = transport.subscribe?.('selection.changed', (event) => {
  console.log(event.payload)
})
```

## Wire format

The transport speaks [JSON-RPC 2.0](https://www.jsonrpc.org/specification) over WebSocket frames:

| Direction | Shape |
|-----------|-------|
| Request   | `{ "jsonrpc": "2.0", "id": 1, "method": "...", "params": ... }` |
| Reply     | `{ "jsonrpc": "2.0", "id": 1, "result": ... }` or `{ ..., "error": { "code", "message" } }` |
| Event     | `{ "jsonrpc": "2.0", "method": "...", "params": ... }` _(no id — dispatched to subscribers)_ |

## Apps with non-standard WebSocket protocols

Some apps speak custom WebSocket protocols on top of JSON (e.g. obs-websocket has typed message envelopes with `op` codes; Bitwig uses controller scripts; some DAWs use custom framing). For those, implement a small {@link Transport} adapter that wraps the protocol library — see `examples/obs-bridge` for a reference.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endpoint` | `string` | _required_ | `ws://` or `wss://` URL |
| `token` | `string \| () => string \| Promise<string>` | _none_ | Bearer token sent on connect |
| `timeoutMs` | `number` | `30_000` | Per-call timeout |
| `WebSocketCtor` | `WsCtor` | `ws.WebSocket` | Custom WebSocket constructor (for tests or alternate runtimes) |

## Errors

- `TransportError` — connection failure, timeout, JSON-RPC error, malformed frame
- `AuthError` — close code 401/403 on connect

## License

[MIT](../../LICENSE) © Alexandre Parena
