import { describe, expect, it, vi } from 'vitest'

import { ToolError, TransportError, defineBridge, defineTool } from '../src/index.js'
import type { Transport } from '../src/index.js'

function fakeTransport(overrides: Partial<Transport> = {}): Transport {
  let connected = false
  const defaultCall = (async (method: string) => ({ method })) as Transport['call']
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
    call: defaultCall,
    ...overrides,
  }
}

describe('defineBridge', () => {
  it('starts idle and transitions through connect / disconnect', async () => {
    const bridge = defineBridge({
      app: { id: 'fake', name: 'Fake App' },
      transport: fakeTransport(),
    })

    expect(bridge.status).toBe('idle')
    expect(bridge.isConnected()).toBe(false)

    await bridge.connect()
    expect(bridge.status).toBe('connected')
    expect(bridge.isConnected()).toBe(true)

    await bridge.disconnect()
    expect(bridge.status).toBe('idle')
    expect(bridge.isConnected()).toBe(false)
  })

  it('invokes onConnect / onDisconnect hooks in order', async () => {
    const order: string[] = []
    const transport = fakeTransport()
    const bridge = defineBridge({
      app: { id: 'fake', name: 'Fake App' },
      transport,
      lifecycle: {
        onConnect: () => {
          order.push('connect')
        },
        onDisconnect: () => {
          order.push('disconnect')
        },
      },
    })

    await bridge.connect()
    await bridge.disconnect()
    expect(order).toEqual(['connect', 'disconnect'])
  })

  it('refuses to call when not connected', async () => {
    const bridge = defineBridge({
      app: { id: 'fake', name: 'Fake App' },
      transport: fakeTransport(),
    })

    await expect(bridge.call('whatever')).rejects.toBeInstanceOf(TransportError)
  })

  it('forwards calls to the transport once connected', async () => {
    const callSpy = vi.fn(async (method: string) => ({ ok: true, method }))
    const bridge = defineBridge({
      app: { id: 'fake', name: 'Fake App' },
      transport: fakeTransport({ call: callSpy as unknown as Transport['call'] }),
    })

    await bridge.connect()
    const result = await bridge.call('document.list')
    expect(callSpy).toHaveBeenCalledWith('document.list', undefined)
    expect(result).toEqual({ ok: true, method: 'document.list' })
  })

  it('registers tools from config and via .tool()', () => {
    const bridge = defineBridge({
      app: { id: 'fake', name: 'Fake App' },
      transport: fakeTransport(),
      tools: [
        defineTool({
          name: 'a',
          description: 'a',
          handler: () => 1,
        }),
      ],
    })

    bridge.tool(
      defineTool({
        name: 'b',
        description: 'b',
        handler: () => 2,
      }),
    )

    expect(bridge.listTools().map((t) => t.name)).toEqual(['a', 'b'])
  })

  it('throws ToolError on duplicate tool names', () => {
    const bridge = defineBridge({
      app: { id: 'fake', name: 'Fake App' },
      transport: fakeTransport(),
      tools: [defineTool({ name: 'dup', description: '', handler: () => 0 })],
    })

    expect(() =>
      bridge.tool(defineTool({ name: 'dup', description: '', handler: () => 0 })),
    ).toThrow(ToolError)
  })

  it('wraps lifecycle.onError when transport.connect throws', async () => {
    const onError = vi.fn()
    const bridge = defineBridge({
      app: { id: 'fake', name: 'Fake App' },
      transport: fakeTransport({
        async connect() {
          throw new Error('boom')
        },
      }),
      lifecycle: { onError },
    })

    await expect(bridge.connect()).rejects.toBeInstanceOf(TransportError)
    expect(onError).toHaveBeenCalledOnce()
    expect(bridge.status).toBe('error')
  })
})
