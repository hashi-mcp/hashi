import {
  AuthError,
  type Transport,
  TransportError,
  type TransportEvent,
  type Unsubscribe,
} from '@hashi-mcp/core'
import OBSWebSocket from 'obs-websocket-js'

/** Configuration accepted by {@link obsTransport}. */
export interface ObsTransportOptions {
  /**
   * WebSocket endpoint of the obs-websocket plugin.
   * Default: `ws://127.0.0.1:4455` (matches the OBS default).
   */
  readonly endpoint?: string
  /**
   * Password configured in OBS → Tools → WebSocket Server Settings → Generate Password.
   * If the OBS server has authentication disabled, pass `undefined`.
   */
  readonly password?: string
}

interface ObsErrorLike {
  code?: number
  message?: string
}

/**
 * Adapter that exposes OBS Studio's `obs-websocket` plugin as a Hashi
 * {@link Transport}. Wraps the `obs-websocket-js` library, which handles
 * the protocol-specific handshake (Hello / Identify / Identified) and the
 * authentication challenge.
 */
export function obsTransport(options: ObsTransportOptions = {}): Transport {
  const endpoint = options.endpoint ?? 'ws://127.0.0.1:4455'
  const obs = new OBSWebSocket()
  let connected = false

  return {
    async connect() {
      if (connected) return
      try {
        await obs.connect(endpoint, options.password)
        connected = true
      } catch (cause) {
        const err = cause as ObsErrorLike
        // obs-websocket-js v5 uses code 4009 for authentication failure
        // (see https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md#webSocketCloseCode).
        if (err.code === 4009) {
          throw new AuthError('OBS authentication failed (wrong password?)', cause)
        }
        throw new TransportError(`Failed to connect to OBS at ${endpoint}`, cause)
      }
    },

    async disconnect() {
      if (!connected) return
      try {
        await obs.disconnect()
      } finally {
        connected = false
      }
    },

    isConnected() {
      return connected
    },

    async call<TResult = unknown>(method: string, params?: unknown): Promise<TResult> {
      if (!connected) {
        throw new TransportError('OBS transport is not connected')
      }
      try {
        const result = await obs.call(
          method as Parameters<typeof obs.call>[0],
          params as Parameters<typeof obs.call>[1],
        )
        return result as TResult
      } catch (cause) {
        const err = cause as ObsErrorLike
        throw new TransportError(
          `OBS request "${method}" failed: ${err.message ?? 'unknown error'}`,
          cause,
        )
      }
    },

    subscribe<TPayload = unknown>(
      eventType: string,
      handler: (event: TransportEvent<TPayload>) => void | Promise<void>,
    ): Unsubscribe {
      const wrapped = (data: unknown) => {
        void handler({
          type: eventType,
          payload: data as TPayload,
          timestamp: Date.now(),
        })
      }
      // obs-websocket-js types `on`/`off` with a discriminated union mapping each
      // event name to its specific payload shape. We accept any event name as
      // a string at runtime, so we widen through `never` here.
      const emitter = obs as unknown as {
        on(event: string, fn: (data: unknown) => void): void
        off(event: string, fn: (data: unknown) => void): void
      }
      emitter.on(eventType, wrapped)
      return () => {
        emitter.off(eventType, wrapped)
      }
    },
  }
}
