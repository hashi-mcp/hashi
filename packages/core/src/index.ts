export type {
  AppDescriptor,
  Bridge,
  BridgeConfig,
  BridgeStatus,
} from './bridge.js'
export { defineBridge } from './bridge.js'

export type { Lifecycle } from './lifecycle.js'

export type { Tool, ToolHandler } from './tool.js'
export { defineTool } from './tool.js'

export type { Transport, TransportEvent, Unsubscribe } from './transport.js'

export {
  AuthError,
  HashiError,
  LifecycleError,
  ToolError,
  TransportError,
} from './errors.js'
