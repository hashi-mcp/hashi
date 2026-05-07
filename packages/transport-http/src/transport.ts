import { AuthError, type Transport, TransportError } from '@hashi-mcp/core'

/** Configuration accepted by {@link httpTransport}. */
export interface HttpTransportOptions {
  /**
   * Base endpoint URL of the host app's local HTTP server, e.g. `http://127.0.0.1:7654`.
   * Hashi will POST JSON-RPC 2.0 requests to `${endpoint}/rpc` by default.
   */
  readonly endpoint: string

  /**
   * Path appended to {@link endpoint} for JSON-RPC calls. Default: `/rpc`.
   */
  readonly rpcPath?: string

  /**
   * Path used by {@link Transport.connect} to verify the host is alive (HTTP GET).
   * Default: `/_hashi/ping`. Set to `null` to disable the check (connect becomes a no-op).
   */
  readonly pingPath?: string | null

  /**
   * Bearer token sent in the `Authorization` header. May be a plain string or a
   * function returning the current token (useful for token rotation).
   */
  readonly token?: string | (() => string | Promise<string>)

  /**
   * Per-request timeout in milliseconds. Default: 30_000.
   */
  readonly timeoutMs?: number

  /**
   * Custom `fetch` implementation. Default: the global `fetch`. Useful for tests
   * or when running on a runtime without `fetch`.
   */
  readonly fetch?: typeof fetch
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

interface JsonRpcError {
  readonly jsonrpc: '2.0'
  readonly id: number | null
  readonly error: {
    readonly code: number
    readonly message: string
    readonly data?: unknown
  }
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError

function isJsonRpcError(r: JsonRpcResponse<unknown>): r is JsonRpcError {
  return 'error' in r
}

class HttpTransportImpl implements Transport {
  #connected = false
  #nextId = 1
  readonly #fetch: typeof fetch
  readonly #rpcUrl: string
  readonly #pingUrl: string | null
  readonly #timeoutMs: number

  constructor(readonly options: HttpTransportOptions) {
    if (!options.endpoint) {
      throw new TransportError('httpTransport: `endpoint` is required')
    }
    this.#fetch = options.fetch ?? globalThis.fetch
    if (!this.#fetch) {
      throw new TransportError(
        'httpTransport: no global `fetch` available. Pass `fetch` in options or upgrade to Node 18+.',
      )
    }
    const base = options.endpoint.replace(/\/+$/, '')
    this.#rpcUrl = `${base}${options.rpcPath ?? '/rpc'}`
    const ping = options.pingPath
    this.#pingUrl = ping === null ? null : `${base}${ping ?? '/_hashi/ping'}`
    this.#timeoutMs = options.timeoutMs ?? 30_000
  }

  isConnected(): boolean {
    return this.#connected
  }

  async connect(): Promise<void> {
    if (this.#connected) return
    if (this.#pingUrl === null) {
      this.#connected = true
      return
    }
    try {
      const headers = await this.#headers(false)
      const res = await this.#fetchWithTimeout(this.#pingUrl, { method: 'GET', headers })
      if (res.status === 401 || res.status === 403) {
        throw new AuthError(`Authentication failed (${res.status}) on ${this.#pingUrl}`)
      }
      if (!res.ok) {
        throw new TransportError(`Ping returned ${res.status} on ${this.#pingUrl}`)
      }
      this.#connected = true
    } catch (cause) {
      if (cause instanceof TransportError || cause instanceof AuthError) throw cause
      throw new TransportError(`Failed to reach ${this.#pingUrl}`, cause)
    }
  }

  async disconnect(): Promise<void> {
    this.#connected = false
  }

  async call<TResult = unknown>(method: string, params?: unknown): Promise<TResult> {
    const id = this.#nextId++
    const body: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    const headers = await this.#headers(true)
    let res: Response
    try {
      res = await this.#fetchWithTimeout(this.#rpcUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    } catch (cause) {
      throw new TransportError(`HTTP request to ${this.#rpcUrl} failed`, cause)
    }

    if (res.status === 401 || res.status === 403) {
      throw new AuthError(`Authentication failed (${res.status}) on ${this.#rpcUrl}`)
    }
    if (!res.ok) {
      throw new TransportError(`HTTP ${res.status} on ${this.#rpcUrl}`)
    }

    let payload: JsonRpcResponse<TResult>
    try {
      payload = (await res.json()) as JsonRpcResponse<TResult>
    } catch (cause) {
      throw new TransportError(`Malformed JSON response from ${this.#rpcUrl}`, cause)
    }

    if (isJsonRpcError(payload)) {
      throw new TransportError(
        `JSON-RPC error ${payload.error.code}: ${payload.error.message}`,
        payload.error.data,
      )
    }
    return payload.result
  }

  async #headers(json: boolean): Promise<Headers> {
    const h = new Headers()
    if (json) h.set('content-type', 'application/json')
    h.set('accept', 'application/json')
    const token = await this.#resolveToken()
    if (token) h.set('authorization', `Bearer ${token}`)
    return h
  }

  async #resolveToken(): Promise<string | undefined> {
    const t = this.options.token
    if (t === undefined) return undefined
    return typeof t === 'function' ? await t() : t
  }

  async #fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), this.#timeoutMs)
    try {
      return await this.#fetch(url, { ...init, signal: ac.signal })
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * Create an HTTP/JSON-RPC transport for a Hashi {@link Bridge}.
 *
 * The transport posts JSON-RPC 2.0 requests to `${endpoint}${rpcPath}` and uses
 * `${endpoint}${pingPath}` for connection probing.
 *
 * @example
 * ```ts
 * import { defineBridge } from '@hashi-mcp/core'
 * import { httpTransport } from '@hashi-mcp/transport-http'
 *
 * const bridge = defineBridge({
 *   app: { id: 'excel', name: 'Microsoft Excel' },
 *   transport: httpTransport({
 *     endpoint: 'http://127.0.0.1:7654',
 *     token: process.env.HASHI_EXCEL_TOKEN,
 *   }),
 * })
 * ```
 */
export function httpTransport(options: HttpTransportOptions): Transport {
  return new HttpTransportImpl(options)
}
