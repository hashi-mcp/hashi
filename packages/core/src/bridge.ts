import { LifecycleError, ToolError, TransportError } from './errors.js'
import type { Lifecycle } from './lifecycle.js'
import type { Tool } from './tool.js'
import type { Transport } from './transport.js'

/** Stable identifier of a host application Hashi can bridge to. */
export interface AppDescriptor {
  /** Lowercase short id, conventionally a-z0-9 separated by dashes. */
  readonly id: string
  /** Human-readable name, used in logs and UI. */
  readonly name: string
  /** Vendor or publisher, e.g. `'autodesk'`, `'adobe'`, `'blender'`. */
  readonly vendor?: string
  /** Optional version string of the host app this bridge targets. */
  readonly version?: string
}

/** State of a {@link Bridge} from the runtime's perspective. */
export type BridgeStatus = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error'

/** Configuration accepted by {@link defineBridge}. */
export interface BridgeConfig {
  readonly app: AppDescriptor
  readonly transport: Transport
  readonly lifecycle?: Lifecycle
  readonly tools?: readonly Tool[]
}

/**
 * A connection to one host app, exposing a set of {@link Tool}s and
 * delegating method calls to a {@link Transport}.
 *
 * Use {@link defineBridge} to construct one.
 */
export interface Bridge {
  readonly config: BridgeConfig
  readonly status: BridgeStatus

  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean

  /** Forward a raw method call to the transport. Most consumers go through tools instead. */
  call<TResult = unknown>(method: string, params?: unknown): Promise<TResult>

  /** Register an additional tool after construction. Returns the bridge for chaining. */
  tool<TInput, TOutput>(tool: Tool<TInput, TOutput>): Bridge

  /** Snapshot of all tools currently registered on the bridge (config + runtime). */
  listTools(): readonly Tool[]
}

// `Tool` defaults its generics to `unknown`, so `Tool` ≡ `Tool<unknown, unknown>`.
// We use that as the storage type and cast at registration boundaries — public APIs
// keep precise generics, only the internal map widens.
type AnyTool = Tool<unknown, unknown>

class BridgeImpl implements Bridge {
  #status: BridgeStatus = 'idle'
  readonly #tools: Map<string, AnyTool> = new Map()

  constructor(readonly config: BridgeConfig) {
    for (const tool of config.tools ?? []) {
      this.#registerTool(tool as AnyTool)
    }
  }

  get status(): BridgeStatus {
    return this.#status
  }

  isConnected(): boolean {
    return this.#status === 'connected' && this.config.transport.isConnected()
  }

  async connect(): Promise<void> {
    if (this.#status === 'connected' || this.#status === 'connecting') return
    this.#status = 'connecting'

    try {
      await this.config.transport.connect()
      this.#status = 'connected'
      try {
        await this.config.lifecycle?.onConnect?.()
      } catch (cause) {
        throw new LifecycleError('onConnect hook threw', cause)
      }
    } catch (cause) {
      this.#status = 'error'
      try {
        await this.config.lifecycle?.onError?.(cause)
      } catch {
        // swallow — onError must not mask the original error
      }
      if (cause instanceof TransportError || cause instanceof LifecycleError) throw cause
      throw new TransportError('Transport failed to connect', cause)
    }
  }

  async disconnect(): Promise<void> {
    if (this.#status === 'idle' || this.#status === 'disconnecting') return
    this.#status = 'disconnecting'
    try {
      await this.config.transport.disconnect()
    } finally {
      this.#status = 'idle'
      try {
        await this.config.lifecycle?.onDisconnect?.()
      } catch {
        // swallow — disconnect should always succeed from the caller's perspective
      }
    }
  }

  async call<TResult = unknown>(method: string, params?: unknown): Promise<TResult> {
    if (!this.isConnected()) {
      throw new TransportError(`Bridge "${this.config.app.id}" is not connected`)
    }
    try {
      return await this.config.transport.call<TResult>(method, params)
    } catch (cause) {
      if (cause instanceof TransportError) throw cause
      throw new TransportError(`Transport.call("${method}") failed`, cause)
    }
  }

  tool<TInput, TOutput>(tool: Tool<TInput, TOutput>): Bridge {
    this.#registerTool(tool as AnyTool)
    return this
  }

  listTools(): readonly Tool[] {
    return [...this.#tools.values()]
  }

  #registerTool(tool: AnyTool): void {
    if (this.#tools.has(tool.name)) {
      throw new ToolError(`Duplicate tool name "${tool.name}"`, tool.name)
    }
    this.#tools.set(tool.name, tool)
  }
}

/**
 * Construct a {@link Bridge} for a host app.
 *
 * @example
 * ```ts
 * import { defineBridge, defineTool } from '@hashi-mcp/core'
 * import { httpTransport } from '@hashi-mcp/transport-http'
 *
 * const bridge = defineBridge({
 *   app: { id: 'excel', name: 'Microsoft Excel', vendor: 'microsoft' },
 *   transport: httpTransport({ endpoint: 'http://127.0.0.1:7654' }),
 *   tools: [
 *     defineTool({
 *       name: 'workbook.list',
 *       description: 'List open Excel workbooks.',
 *       handler: () => bridge.call('workbook.list'),
 *     }),
 *   ],
 * })
 * ```
 */
export function defineBridge(config: BridgeConfig): Bridge {
  return new BridgeImpl(config)
}
