/**
 * Lifecycle hooks observed by a {@link Bridge}. All hooks are optional.
 *
 * Hooks let consumers react to the host app coming online, going away, or
 * misbehaving — useful for showing UI state in Hashi Studio, logging audit
 * events, or attempting reconnection.
 */
export interface Lifecycle {
  /**
   * Probe to detect whether the host app is currently reachable.
   * Called by the server before sending tool calls. Should be cheap and idempotent.
   *
   * @returns `true` if the app is responding, `false` otherwise.
   */
  detect?(): Promise<boolean>

  /** Invoked once when the bridge transitions from disconnected to connected. */
  onConnect?(): Promise<void> | void

  /** Invoked once when the bridge transitions from connected to disconnected. */
  onDisconnect?(): Promise<void> | void

  /** Invoked when the transport raises an error the bridge could not recover from. */
  onError?(error: unknown): Promise<void> | void
}
