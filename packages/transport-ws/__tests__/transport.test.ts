import { TransportError } from '@hashi-mcp/core'
import { describe, expect, it, vi } from 'vitest'

import { type WsLike, wsTransport } from '../src/index.js'

interface FakeEvent {
  data?: unknown
  code?: number
  reason?: string
}

/**
 * Minimal fake WebSocket suitable for the transport's expectations.
 * Tests drive it via `emit*` methods.
 */
class FakeWs implements WsLike {
  static instances: FakeWs[] = []
  readonly sent: string[] = []
  readyState = 0
  readonly #listeners = new Map<string, Array<(event: FakeEvent) => void>>()
  readonly url: string

  constructor(url: string, _options?: { headers?: Record<string, string> }) {
    this.url = url
    FakeWs.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(code = 1000, reason = ''): void {
    this.readyState = 3
    this.#emit('close', { code, reason })
  }

  addEventListener(type: string, handler: (event: FakeEvent) => void): void {
    const list = this.#listeners.get(type) ?? []
    list.push(handler)
    this.#listeners.set(type, list)
  }

  emitOpen(): void {
    this.readyState = 1
    this.#emit('open', {})
  }

  emitMessage(payload: unknown): void {
    this.#emit('message', { data: JSON.stringify(payload) })
  }

  emitClose(code = 1006): void {
    this.readyState = 3
    this.#emit('close', { code })
  }

  #emit(type: string, event: FakeEvent): void {
    for (const handler of this.#listeners.get(type) ?? []) handler(event)
  }
}

function lastInstance(): FakeWs {
  const w = FakeWs.instances.at(-1)
  if (!w) throw new Error('No FakeWs instance was created')
  return w
}

describe('wsTransport', () => {
  it('throws on construction without endpoint', () => {
    expect(() => wsTransport({ endpoint: '' })).toThrow(TransportError)
  })

  it('connect opens a WebSocket and resolves on the open event', async () => {
    FakeWs.instances.length = 0
    const t = wsTransport({
      endpoint: 'ws://localhost:9999',
      WebSocketCtor: FakeWs as unknown as new (url: string) => WsLike,
    })
    const promise = t.connect()
    queueMicrotask(() => lastInstance().emitOpen())
    await promise
    expect(t.isConnected()).toBe(true)
    expect(lastInstance().url).toBe('ws://localhost:9999')
  })

  it('call serialises JSON-RPC and resolves on matching reply', async () => {
    FakeWs.instances.length = 0
    const t = wsTransport({
      endpoint: 'ws://localhost:9999',
      WebSocketCtor: FakeWs as unknown as new (url: string) => WsLike,
    })
    const open = t.connect()
    queueMicrotask(() => lastInstance().emitOpen())
    await open

    const callPromise = t.call<{ ok: boolean }>('do.something', { x: 1 })

    // Inspect what was sent
    expect(lastInstance().sent).toHaveLength(1)
    const sent = JSON.parse(lastInstance().sent[0]!)
    expect(sent).toMatchObject({ jsonrpc: '2.0', method: 'do.something', params: { x: 1 } })

    // Reply
    lastInstance().emitMessage({ jsonrpc: '2.0', id: sent.id, result: { ok: true } })
    await expect(callPromise).resolves.toEqual({ ok: true })
  })

  it('call rejects with TransportError on JSON-RPC error frame', async () => {
    FakeWs.instances.length = 0
    const t = wsTransport({
      endpoint: 'ws://localhost:9999',
      WebSocketCtor: FakeWs as unknown as new (url: string) => WsLike,
    })
    const open = t.connect()
    queueMicrotask(() => lastInstance().emitOpen())
    await open

    const callPromise = t.call('does.not.exist')
    const sent = JSON.parse(lastInstance().sent[0]!)
    lastInstance().emitMessage({
      jsonrpc: '2.0',
      id: sent.id,
      error: { code: -32601, message: 'Method not found' },
    })
    await expect(callPromise).rejects.toThrow(/Method not found/)
  })

  it('subscribe dispatches push events to handlers', async () => {
    FakeWs.instances.length = 0
    const t = wsTransport({
      endpoint: 'ws://localhost:9999',
      WebSocketCtor: FakeWs as unknown as new (url: string) => WsLike,
    })
    const open = t.connect()
    queueMicrotask(() => lastInstance().emitOpen())
    await open

    const handler = vi.fn()
    const unsubscribe = t.subscribe!('selection.changed', handler)

    lastInstance().emitMessage({
      jsonrpc: '2.0',
      method: 'selection.changed',
      params: { id: 42 },
    })
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0]![0]).toMatchObject({
      type: 'selection.changed',
      payload: { id: 42 },
    })

    unsubscribe()
    lastInstance().emitMessage({
      jsonrpc: '2.0',
      method: 'selection.changed',
      params: { id: 43 },
    })
    expect(handler).toHaveBeenCalledOnce() // still only the first one
  })

  it('disconnect rejects all pending calls', async () => {
    FakeWs.instances.length = 0
    const t = wsTransport({
      endpoint: 'ws://localhost:9999',
      WebSocketCtor: FakeWs as unknown as new (url: string) => WsLike,
    })
    const open = t.connect()
    queueMicrotask(() => lastInstance().emitOpen())
    await open

    const callPromise = t.call('long.thing')
    await t.disconnect()
    await expect(callPromise).rejects.toBeInstanceOf(TransportError)
    expect(t.isConnected()).toBe(false)
  })

  it('call times out if no reply arrives', async () => {
    vi.useFakeTimers()
    FakeWs.instances.length = 0
    const t = wsTransport({
      endpoint: 'ws://localhost:9999',
      timeoutMs: 50,
      WebSocketCtor: FakeWs as unknown as new (url: string) => WsLike,
    })
    const open = t.connect()
    queueMicrotask(() => lastInstance().emitOpen())
    await open

    const callPromise = t.call('slow')
    vi.advanceTimersByTime(60)
    await expect(callPromise).rejects.toThrow(/timed out/)
    vi.useRealTimers()
  })
})
