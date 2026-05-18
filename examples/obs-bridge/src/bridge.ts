import { type Bridge, defineBridge, defineTool } from '@hashi-mcp/core'

import { obsTransport } from './obs-transport.js'

/** Configuration for the OBS bridge. */
export interface CreateObsBridgeOptions {
  /** WebSocket endpoint of the obs-websocket plugin. Default: `ws://127.0.0.1:4455`. */
  readonly endpoint?: string
  /** Password set in OBS WebSocket Server Settings, if authentication is enabled. */
  readonly password?: string
}

interface SceneInfo {
  readonly sceneName: string
  readonly sceneIndex: number
}

interface InputInfo {
  readonly inputName: string
  readonly inputKind: string
  readonly unversionedInputKind: string
}

interface SceneItem {
  readonly sceneItemId: number
  readonly sourceName: string
  readonly sceneItemEnabled: boolean
}

/**
 * Build a {@link Bridge} that exposes OBS Studio to Claude through the
 * obs-websocket plugin. Tools intentionally mirror the obs-websocket request
 * names where it makes sense, while staying readable for an LLM.
 */
export function createObsBridge(options: CreateObsBridgeOptions = {}): Bridge {
  // Build transport options without passing explicit `undefined` to optional fields
  // (exactOptionalPropertyTypes is enabled across the monorepo).
  const transportOpts: { endpoint?: string; password?: string } = {}
  if (options.endpoint !== undefined) transportOpts.endpoint = options.endpoint
  if (options.password !== undefined) transportOpts.password = options.password

  const bridge: Bridge = defineBridge({
    app: { id: 'obs', name: 'OBS Studio', vendor: 'obs-project' },
    transport: obsTransport(transportOpts),
    tools: [
      defineTool({
        name: 'scene.list',
        description: 'List all scenes in the current OBS profile.',
        handler: async () => {
          const out = await bridge.call<{
            scenes: SceneInfo[]
            currentProgramSceneName: string
            currentPreviewSceneName?: string
          }>('GetSceneList')
          return {
            scenes: out.scenes.map((s) => s.sceneName),
            current: out.currentProgramSceneName,
            preview: out.currentPreviewSceneName ?? null,
          }
        },
      }),

      defineTool({
        name: 'scene.current',
        description: 'Get the name of the scene currently being broadcast.',
        handler: async () => {
          const out = await bridge.call<{ currentProgramSceneName: string }>(
            'GetCurrentProgramScene',
          )
          return { current: out.currentProgramSceneName }
        },
      }),

      defineTool({
        name: 'scene.activate',
        description: 'Switch the program output to a specific scene by name.',
        inputSchema: {
          type: 'object',
          properties: {
            sceneName: { type: 'string', description: 'Exact name of the scene to switch to.' },
          },
          required: ['sceneName'],
          additionalProperties: false,
        },
        handler: async (input: unknown) => {
          const { sceneName } = (input as { sceneName: string }) ?? {}
          await bridge.call('SetCurrentProgramScene', { sceneName })
          return { ok: true, current: sceneName }
        },
      }),

      defineTool({
        name: 'input.list',
        description: 'List all inputs (sources) configured in OBS.',
        handler: async () => {
          const out = await bridge.call<{ inputs: InputInfo[] }>('GetInputList')
          return {
            inputs: out.inputs.map((i) => ({ name: i.inputName, kind: i.inputKind })),
          }
        },
      }),

      defineTool({
        name: 'input.set_visibility',
        description:
          'Show or hide a scene item (source) in a given scene. Use scene.list first to find the scene name.',
        inputSchema: {
          type: 'object',
          properties: {
            sceneName: { type: 'string' },
            sourceName: { type: 'string', description: 'Name of the source within the scene.' },
            visible: { type: 'boolean' },
          },
          required: ['sceneName', 'sourceName', 'visible'],
          additionalProperties: false,
        },
        handler: async (input: unknown) => {
          const { sceneName, sourceName, visible } = input as {
            sceneName: string
            sourceName: string
            visible: boolean
          }
          // Need to resolve sceneItemId from sourceName within the scene.
          const list = await bridge.call<{ sceneItems: SceneItem[] }>('GetSceneItemList', {
            sceneName,
          })
          const item = list.sceneItems.find((s) => s.sourceName === sourceName)
          if (!item) {
            throw new Error(`Source "${sourceName}" not found in scene "${sceneName}"`)
          }
          await bridge.call('SetSceneItemEnabled', {
            sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemEnabled: visible,
          })
          return { ok: true, sceneName, sourceName, visible }
        },
      }),

      defineTool({
        name: 'input.set_mute',
        description: 'Mute or unmute an audio input by name.',
        inputSchema: {
          type: 'object',
          properties: {
            inputName: { type: 'string' },
            muted: { type: 'boolean' },
          },
          required: ['inputName', 'muted'],
          additionalProperties: false,
        },
        handler: async (input: unknown) => {
          const { inputName, muted } = input as { inputName: string; muted: boolean }
          await bridge.call('SetInputMute', { inputName, inputMuted: muted })
          return { ok: true, inputName, muted }
        },
      }),

      defineTool({
        name: 'stream.start',
        description: 'Start streaming. No-op if already streaming.',
        handler: async () => {
          await bridge.call('StartStream')
          return { ok: true, streaming: true }
        },
      }),

      defineTool({
        name: 'stream.stop',
        description: 'Stop streaming. No-op if not streaming.',
        handler: async () => {
          await bridge.call('StopStream')
          return { ok: true, streaming: false }
        },
      }),

      defineTool({
        name: 'record.start',
        description: 'Start recording. Resolves once OBS confirms the recording started.',
        handler: async () => {
          await bridge.call('StartRecord')
          return { ok: true, recording: true }
        },
      }),

      defineTool({
        name: 'record.stop',
        description: 'Stop recording and return the path of the file OBS just wrote, if available.',
        handler: async () => {
          const out = await bridge.call<{ outputPath?: string }>('StopRecord')
          return { ok: true, recording: false, outputPath: out.outputPath ?? null }
        },
      }),
    ],
  })

  return bridge
}
