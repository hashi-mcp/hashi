/**
 * Base error for everything in Hashi. All thrown errors inherit from this so that
 * library consumers can do `catch (err) { if (err instanceof HashiError) ... }`.
 */
export class HashiError extends Error {
  override readonly name: string = 'HashiError'

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** The transport layer failed (connection refused, timeout, malformed response, ...). */
export class TransportError extends HashiError {
  override readonly name = 'TransportError'
}

/** A tool handler threw, returned an unexpected shape, or was called incorrectly. */
export class ToolError extends HashiError {
  override readonly name = 'ToolError'

  constructor(
    message: string,
    readonly toolName: string,
    cause?: unknown,
  ) {
    super(message, cause)
  }
}

/** Authentication or authorization failed at the transport level. */
export class AuthError extends HashiError {
  override readonly name = 'AuthError'
}

/** A lifecycle hook (detect/onConnect/onDisconnect) failed. */
export class LifecycleError extends HashiError {
  override readonly name = 'LifecycleError'
}
