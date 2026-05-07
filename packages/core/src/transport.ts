/**
 * A function returned by {@link Transport.subscribe} that, when called, removes
 * the subscription. Idempotent — calling it twice is a no-op.
 */
export type Unsubscribe = () => void

/**
 * An event pushed by the host app to Hashi over a streaming transport
 * (WebSocket, named pipe, D-Bus). File-based and HTTP transports may not
 * support events.
 */
export interface TransportEvent<TPayload = unknown> {
  /** Event channel name, e.g. `'selection.changed'`, `'document.saved'`. */
  readonly type: string
  /** Event payload, opaque to the transport — schema is host-defined. */
  readonly payload: TPayload
  /** Timestamp at which the host generated the event (ms since epoch). */
  readonly timestamp: number
}

/**
 * The contract a transport must implement to be usable by a {@link Bridge}.
 *
 * Implementations live in dedicated packages — see `@hashi-mcp/transport-http`,
 * `@hashi-mcp/transport-ws`, etc.
 */
export interface Transport {
  /**
   * Establish the connection to the host app. Idempotent.
   *
   * @throws {TransportError} if the connection cannot be established.
   * @throws {AuthError}      if authentication fails.
   */
  connect(): Promise<void>

  /** Tear down the connection cleanly. Idempotent. */
  disconnect(): Promise<void>

  /** True if {@link connect} has succeeded and {@link disconnect} has not been called since. */
  isConnected(): boolean

  /**
   * Invoke a remote method on the host app and wait for its reply.
   *
   * @param method  Dotted method identifier, e.g. `'document.list'`.
   * @param params  Arbitrary serializable payload for the method.
   * @returns       The host's reply, typed by the caller.
   */
  call<TResult = unknown>(method: string, params?: unknown): Promise<TResult>

  /**
   * Subscribe to push events from the host app, if supported by this transport.
   * Optional — file and HTTP transports may omit it.
   */
  subscribe?<TPayload = unknown>(
    eventType: string,
    handler: (event: TransportEvent<TPayload>) => void | Promise<void>,
  ): Unsubscribe
}
