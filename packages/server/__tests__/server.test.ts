import { type Transport, defineBridge, defineTool } from '@hashi-mcp/core'
import { describe, expect, it } from 'vitest'

import { createServer } from '../src/index.js'

function noopTransport(): Transport {
  let connected = false
  const noopCall = (async () => undefined) as Transport['call']
  return {
    async connect() {
      connected = true
    },
    async disconnect() {
      connected = false
    },
    isConnected() {
      return connected
    },
    call: noopCall,
  }
}

describe('createServer', () => {
  it('builds a namespaced tool map from a single bridge', () => {
    const bridge = defineBridge({
      app: { id: 'excel', name: 'Excel' },
      transport: noopTransport(),
      tools: [
        defineTool({ name: 'workbook.list', description: 'List workbooks', handler: () => [] }),
        defineTool({ name: 'cell.read', description: 'Read a cell', handler: () => null }),
      ],
    })

    const server = createServer({ name: 'excel-bridge', version: '0.0.1', bridges: [bridge] })
    expect(server.mcp).toBeDefined()
  })

  it('throws on duplicate tool names across bridges', () => {
    const a = defineBridge({
      app: { id: 'shared', name: 'A' },
      transport: noopTransport(),
      tools: [defineTool({ name: 'ping', description: '', handler: () => 1 })],
    })
    const b = defineBridge({
      app: { id: 'shared', name: 'B' },
      transport: noopTransport(),
      tools: [defineTool({ name: 'ping', description: '', handler: () => 2 })],
    })

    expect(() => createServer({ name: 'dup', version: '0.0.1', bridges: [a, b] })).toThrow(
      /Duplicate tool name/,
    )
  })

  it('namespaces tool names with the bridge id (different bridges, same tool name)', () => {
    const excel = defineBridge({
      app: { id: 'excel', name: 'Excel' },
      transport: noopTransport(),
      tools: [defineTool({ name: 'list', description: '', handler: () => 'excel' })],
    })
    const blender = defineBridge({
      app: { id: 'blender', name: 'Blender' },
      transport: noopTransport(),
      tools: [defineTool({ name: 'list', description: '', handler: () => 'blender' })],
    })

    // No throw — `excel.list` and `blender.list` don't collide.
    expect(() =>
      createServer({ name: 'multi', version: '0.0.1', bridges: [excel, blender] }),
    ).not.toThrow()
  })
})
