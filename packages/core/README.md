# `@hashi-mcp/core`

> Hashi runtime — `Bridge`, `Tool`, `Transport`, `Lifecycle`. The foundation every Hashi package builds on.

This package defines the four primitives every Hashi integration uses:

- **`Bridge`** — a connection to one desktop app. Holds the transport, the lifecycle hooks, and the registered tools.
- **`Tool`** — one capability exposed to Claude. Has a name, a description, optional input/output schemas, and a handler.
- **`Transport`** — the wire layer. Implementations live in dedicated packages (`@hashi-mcp/transport-http`, `-ws`, `-file`, ...).
- **`Lifecycle`** — optional hooks observed when the bridge connects, disconnects, or errors.

The package also exports custom error types: `HashiError`, `TransportError`, `ToolError`, `AuthError`, `LifecycleError`.

## Install

```bash
pnpm add @hashi-mcp/core
```

## Quick example

```ts
import { defineBridge, defineTool } from '@hashi-mcp/core'
import { httpTransport } from '@hashi-mcp/transport-http'

const bridge = defineBridge({
  app: { id: 'excel', name: 'Microsoft Excel', vendor: 'microsoft' },
  transport: httpTransport({ endpoint: 'http://127.0.0.1:7654' }),
  tools: [
    defineTool({
      name: 'workbook.list',
      description: 'List open Excel workbooks.',
      handler: () => bridge.call('workbook.list'),
    }),
  ],
})

await bridge.connect()
const workbooks = await bridge.call('workbook.list')
await bridge.disconnect()
```

To expose this bridge to Claude over MCP, pair it with [`@hashi-mcp/server`](../server/README.md).

## License

[MIT](../../LICENSE) © Alexandre Parena
