import { createServer } from '@hashi-mcp/server'

import { type CreateObsBridgeOptions, createObsBridge } from './bridge.js'

const endpoint = process.env.HASHI_OBS_ENDPOINT ?? 'ws://127.0.0.1:4455'
const password = process.env.HASHI_OBS_PASSWORD

// Build options progressively so we don't pass explicit `undefined` to optional
// fields — exactOptionalPropertyTypes is enabled across the monorepo.
const bridgeOptions: CreateObsBridgeOptions = { endpoint }
if (password !== undefined && password !== '') {
  ;(bridgeOptions as { password?: string }).password = password
}

const bridge = createObsBridge(bridgeOptions)

const server = createServer({
  name: 'hashi-obs-bridge',
  version: '0.0.1',
  bridges: [bridge],
})

server.start().catch((error: unknown) => {
  process.stderr.write(
    `hashi-obs-bridge failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exit(1)
})
