import type { Bridge, Tool } from '@hashi-mcp/core'
import { ToolError } from '@hashi-mcp/core'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

/** Configuration accepted by {@link createServer}. */
export interface CreateServerOptions {
  /** Server name advertised to MCP clients (e.g. Claude Desktop). */
  readonly name: string
  /** Server version, typically from `package.json`. */
  readonly version: string
  /** Bridges this server will expose. Tools are namespaced by `<bridge.app.id>.<tool.name>`. */
  readonly bridges: readonly Bridge[]
}

/** Handle returned by {@link createServer}. */
export interface HashiServer {
  /** The underlying `@modelcontextprotocol/sdk` `Server`. Exposed for advanced use cases. */
  readonly mcp: Server
  /** Connect to MCP transport (stdio) and start serving requests. Resolves once connected. */
  start(): Promise<void>
  /** Close the MCP transport and disconnect all bridges. */
  stop(): Promise<void>
}

interface ResolvedTool {
  readonly bridge: Bridge
  readonly tool: Tool
  readonly fullName: string
}

function defaultInputSchema(): { type: 'object'; additionalProperties: boolean } {
  return { type: 'object', additionalProperties: true }
}

function buildToolMap(bridges: readonly Bridge[]): Map<string, ResolvedTool> {
  const map = new Map<string, ResolvedTool>()
  for (const bridge of bridges) {
    const prefix = bridge.config.app.id
    for (const tool of bridge.listTools()) {
      const fullName = `${prefix}.${tool.name}`
      if (map.has(fullName)) {
        throw new ToolError(`Duplicate tool name across bridges: "${fullName}"`, fullName)
      }
      map.set(fullName, { bridge, tool, fullName })
    }
  }
  return map
}

/**
 * Create an MCP server that exposes one or more Hashi bridges to Claude
 * (or any MCP-compatible client).
 *
 * Tools are namespaced by their bridge's `app.id` to avoid collisions when
 * several apps are bridged simultaneously: a tool named `workbook.list` on
 * bridge `excel` becomes `excel.workbook.list` from Claude's perspective.
 *
 * @example
 * ```ts
 * import { defineBridge, defineTool } from '@hashi-mcp/core'
 * import { httpTransport } from '@hashi-mcp/transport-http'
 * import { createServer } from '@hashi-mcp/server'
 *
 * const excel = defineBridge({
 *   app: { id: 'excel', name: 'Microsoft Excel' },
 *   transport: httpTransport({ endpoint: 'http://127.0.0.1:7654' }),
 *   tools: [
 *     defineTool({
 *       name: 'workbook.list',
 *       description: 'List open Excel workbooks.',
 *       handler: () => excel.call('workbook.list'),
 *     }),
 *   ],
 * })
 *
 * await createServer({ name: 'excel-bridge', version: '0.1.0', bridges: [excel] }).start()
 * ```
 */
export function createServer(options: CreateServerOptions): HashiServer {
  const tools = buildToolMap(options.bridges)
  const mcp = new Server(
    { name: options.name, version: options.version },
    { capabilities: { tools: {} } },
  )

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Array.from(tools.values(), ({ tool, fullName }) => ({
      name: fullName,
      description: tool.description,
      inputSchema:
        (tool.inputSchema as Record<string, unknown> | undefined) ?? defaultInputSchema(),
    })),
  }))

  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    const fullName = request.params.name
    const args = request.params.arguments ?? {}

    const entry = tools.get(fullName)
    if (!entry) {
      throw new ToolError(`Unknown tool "${fullName}"`, fullName)
    }
    if (!entry.bridge.isConnected()) {
      await entry.bridge.connect()
    }
    const handler = entry.tool.handler as (input: unknown) => unknown | Promise<unknown>
    const result = await handler(args)
    return {
      content: [
        {
          type: 'text' as const,
          text: typeof result === 'string' ? result : JSON.stringify(result),
        },
      ],
    }
  })

  let transport: StdioServerTransport | undefined

  return {
    mcp,
    async start() {
      transport = new StdioServerTransport()
      await mcp.connect(transport)
    },
    async stop() {
      await mcp.close()
      await Promise.allSettled(options.bridges.map((b) => b.disconnect()))
    },
  }
}
