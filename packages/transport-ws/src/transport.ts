import {
  AuthError,
  type Transport,
  TransportError,
  type TransportEvent,
  type Unsubscribe,
} from '@hashi-mcp/core'
import { WebSocket as DefaultWebSocket } from 'ws'

/**
 * Minimal WebSocket-like contract accepted by {@link wsTransport}. Both the
 * browser `WebSocket` and Node's `ws` package satisfy this shape, so tests can
 * inject a fake implementation cheaply.
 */
export interface WsLike {
  send(data: string): void
  close(code?: number, reason?: string): void
  readonly readyState: number
  addEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    handler: (event: { data?: unknown; code?: number; reason?: string }) => void,
  ): void
  removeEventListener?(type: string, handler: (event: unknown) => void): void
}

interface WsCtor {
  new (url: string, options?: { headers?: Record<string, string> }): WsLike
}

/** Configuration accepted by {@link wsTransport}. */
export interface WsTransportOptions {
  /** WebSocket endpoint, e.g. `ws://127.0.0.1:4455`. */
  readonly endpoint: string
  /**
   * Bearer token sent in the `Authorization` header on connect. May be a plain
   * string or a function returning the current token (token rotation).
   */
  readonly token?: string | (() => string | Promise<string>)
  /** Per-call timeout in milliseconds. Default: 30_000. */
  readonly timeoutMs?: number
  /**
   * Custom WebSocket constructor. Default: `WebSocket` from the `ws` package.
   * Useful for tests, or to use a browser/runtime native implementation.
   */
  readonly WebSocketCtor?: WsCtor
}

interface JsonRpcRequest {
  readonly jsonrpc: '2.0'
  readonly id: number
  readonly method: string
  readonly params?: unknown
}

interface JsonRpcSuccess<T> {
  readonly jsonrpc: '2.0'
  readonly id: number
  readonly result: T
}

interface JsonRpcErrorFrame {
  readonly jsonrpc: '2.0'
  readonly id: number | null
  readonly error: {
    readonly code: number
    readonly message: string
    readonly data?: unknown
  }
}

interface JsonRpcEvent {
  readonly jsonrpc: '2.0'
  readonly method: string
  readonly params: unknown
  readonly id?: undefined
}

type Incoming<T> = JsonRpcSuccess<T> | JsonRpcErrorFrame | JsonRpcEvent

interface PendingCall {
  resolve(value: unknown): void
  reject(error: unknown): void
  timer: ReturnType<typeof setTimeout>
}

const WS_OPEN = 1

class WsTransportImpl implements Transport {
  #ws: WsLike | undefined
  #nextId = 1
  readonly #pending = new Map<number, PendingCall>()
  readonly #subscribers = new Map<string, Set<(event: TransportEvent) => void>>()
  readonly #Ctor: WsCtor
  readonly #timeoutMs: number

  constructor(readonly options: WsTransportOptions) {
    if (!options.endpoint) {
      throw new TransportError('wsTransport: `endpoint` is required')
    }
    this.#Ctor = options.WebSocketCtor ?? (DefaultWebSocket as unknown as WsCtor)
    this.#timeoutMs = options.timeoutMs ?? 30_000
  }

  isConnected(): boolean {
    return this.#ws !== undefined && this.#ws.readyState === WS_OPEN
  }

  async connect(): Promise<void> {
    if (this.isConnected()) return

    const headers: Record<string, string> = {}
    const token = await this.#resolveToken()
    if (token) headers.authorization = `Bearer ${token}`

    const ws = new this.#Ctor(this.options.endpoint, { headers })
    this.#ws = ws

    ws.addEventListener('message', (event) => this.#onMessage(event))
    ws.addEventListener('close', (event) => this.#onClose(event))

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => resolve()
      const onError = (event: { code?: number; reason?: string }) => {
        if (event.code === 401 || event.code === 403) {
          reject(new AuthError(`Authentication failed on ${this.options.endpoint}`))
        } else {
          reject(new TransportError(`Failed to open WebSocket to ${this.options.endpoint}`))
        }
      }
      ws.addEventListener('open', onOpen)
      ws.addEventListener('error', onError)
    })
  }

  async disconnect(): Promise<void> {
    if (this.#ws) {
      this.#ws.close()
      this.#ws = undefined
    }
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new TransportError('Transport disconnected'))
    }
    this.#pending.clear()
  }

  async call<TResult = unknown>(method: string, params?: unknown): Promise<TResult> {
    const ws = this.#ws
    if (!this.isConnected() || !ws) {
      throw new TransportError('WebSocket is not connected')
    }
    const id = this.#nextId++
    const frame: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new TransportError(`Call "${method}" timed out after ${this.#timeoutMs}ms`))
      }, this.#timeoutMs)

      this.#pending.set(id, {
        resolve: (v) => resolve(v as TResult),
        reject,
        timer,
      })

      try {
        ws.send(JSON.stringify(frame))
      } catch (cause) {
        clearTimeout(timer)
        this.#pending.delete(id)
        reject(new TransportError('Failed to send frame on WebSocket', cause))
      }
    })
  }

  subscribe<TPayload = unknown>(
    eventType: string,
    handler: (event: TransportEvent<TPayload>) => void | Promise<void>,
  ): Unsubscribe {
    let set = this.#subscribers.get(eventType)
    if (!set) {
      set = new Set()
      this.#subscribers.set(eventType, set)
    }
    set.add(handler as (event: TransportEvent) => void)
    return () => {
      const current = this.#subscribers.get(eventType)
      current?.delete(handler as (event: TransportEvent) => void)
      if (current && current.size === 0) {
        this.#subscribers.delete(eventType)
      }
    }
  }

  #onMessage(event: { data?: unknown }): void {
    const raw = event.data
    if (typeof raw !== 'string') return
    let frame: Incoming<unknown>
    try {
      frame = JSON.parse(raw) as Incoming<unknown>
    } catch {
      return
    }

    if (typeof (frame as JsonRpcSuccess<unknown>).id === 'number') {
      const settled = frame as JsonRpcSuccess<unknown> | JsonRpcErrorFrame
      const pending = this.#pending.get(settled.id as number)
      if (!pending) return
      this.#pending.delete(settled.id as number)
      clearTimeout(pending.timer)

      if ('error' in settled) {
        pending.reject(
          new TransportError(
            `JSON-RPC error ${settled.error.code}: ${settled.error.message}`,
            settled.error.data,
          ),
        )
      } else {
        pending.resolve(settled.result)
      }
      return
    }

    // No id and a `method` => push event.
    const evt = frame as JsonRpcEvent
    if (typeof evt.method !== 'string') return
    const handlers = this.#subscribers.get(evt.method)
    if (!handlers) return
    const payload: TransportEvent = {
      type: evt.method,
      payload: evt.params,
      timestamp: Date.now(),
    }
    for (const handler of handlers) {
      try {
        handler(payload)
      } catch {
        // Swallow handler errors so one bad subscriber doesn't poison the others.
      }
    }
  }

  #onClose(_event: { code?: number; reason?: string }): void {
    this.#ws = undefined
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new TransportError('WebSocket closed before reply'))
    }
    this.#pending.clear()
  }

  async #resolveToken(): Promise<string | undefined> {
    const t = this.options.token
    if (t === undefined) return undefined
    return typeof t === 'function' ? await t() : t
  }
}

/**
 * Create a WebSocket/JSON-RPC transport for a Hashi {@link Bridge}.
 *
 * Frames follow JSON-RPC 2.0:
 *  - request: `{ jsonrpc: "2.0", id, method, params }`
 *  - reply:   `{ jsonrpc: "2.0", id, result }` or `{ ..., error: { code, message } }`
 *  - event:   `{ jsonrpc: "2.0", method, params }` (no id, dispatched to subscribers)
 *
 * For apps with bespoke WebSocket protocols (e.g. obs-websocket, Bitwig),
 * implement a small adapter that wraps this transport or a custom {@link Transport}.
 *
 * @example
 * ```ts
 * import { defineBridge } from '@hashi-mcp/core'
 * import { wsTransport } from '@hashi-mcp/transport-ws'
 *
 * const bridge = defineBridge({
 *   app: { id: 'my-app', name: 'My App' },
 *   transport: wsTransport({
 *     endpoint: 'ws://127.0.0.1:9090',
 *     token: process.env.HASHI_TOKEN,
 *   }),
 * })
 * ```
 */
export function wsTransport(options: WsTransportOptions): Transport {
  return new WsTransportImpl(options)
}
