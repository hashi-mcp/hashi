# `@hashi-mcp/server`

> MCP server for Hashi bridges. Wraps `@modelcontextprotocol/sdk` and exposes one or more bridges as a single MCP server over stdio.

## Install

```bash
pnpm add @hashi-mcp/core @hashi-mcp/server @hashi-mcp/transport-http
```

## Usage

```ts
import { defineBridge, defineTool } from '@hashi-mcp/core'
import { httpTransport } from '@hashi-mcp/transport-http'
import { createServer } from '@hashi-mcp/server'

const excel = defineBridge({
  app: { id: 'excel', name: 'Microsoft Excel' },
  transport: httpTransport({ endpoint: 'http://127.0.0.1:7654' }),
  tools: [
    defineTool({
      name: 'workbook.list',
      description: 'List open Excel workbooks.',
      handler: () => excel.call('workbook.list'),
    }),
  ],
})

const server = createServer({
  name: 'excel-bridge',
  version: '0.1.0',
  bridges: [excel],
})

await server.start() // connects over stdio
```

## Tool namespacing

When multiple bridges are passed, their tools are namespaced by `<bridge.app.id>.<tool.name>` to avoid collisions. A `workbook.list` tool on the `excel` bridge becomes `excel.workbook.list` from Claude's perspective.

## Multi-app server

Hashi's killer feature — Claude orchestrating several desktop apps in one prompt:

```ts
const server = createServer({
  name: 'desktop-suite',
  version: '0.1.0',
  bridges: [excelBridge, outlookBridge, powerpointBridge],
})
await server.start()
```

Claude now sees tools from all three apps in a single MCP session and can compose workflows across them.

## License

[MIT](../../LICENSE) © Alexandre Parena
