/**
 * The function backing a {@link Tool}. Receives validated input, returns the result.
 * May throw — the bridge will wrap any thrown error in a {@link ToolError}.
 */
export type ToolHandler<TInput, TOutput> = (input: TInput) => TOutput | Promise<TOutput>

/**
 * A capability exposed to Claude through MCP.
 *
 * Tools are the unit of interaction: each one becomes one MCP `Tool` in the
 * server's manifest. The {@link inputSchema} and {@link outputSchema} fields
 * accept any [Standard Schema](https://standardschema.dev/) compatible value
 * (Zod, Valibot, ArkType, ...) — they are passed through to the MCP layer for
 * client-side validation. Hashi does not validate at runtime in v0.x; that
 * responsibility lives in `@hashi-mcp/server`.
 */
export interface Tool<TInput = unknown, TOutput = unknown> {
  /** Tool identifier exposed to Claude. Conventionally `<namespace>.<verb>`. */
  readonly name: string
  /** One-sentence description used by Claude to choose the tool. */
  readonly description: string
  /** Optional schema for the input. Standard Schema compatible. */
  readonly inputSchema?: unknown
  /** Optional schema for the output. Standard Schema compatible. */
  readonly outputSchema?: unknown
  /** Function called when Claude invokes this tool. */
  readonly handler: ToolHandler<TInput, TOutput>
}

/**
 * Convenience constructor that preserves type inference on the handler signature.
 *
 * @example
 * ```ts
 * const ping = defineTool({
 *   name: 'app.ping',
 *   description: 'Check if the host app responds.',
 *   handler: async () => ({ ok: true }),
 * })
 * ```
 */
export function defineTool<TInput = unknown, TOutput = unknown>(
  tool: Tool<TInput, TOutput>,
): Tool<TInput, TOutput> {
  return tool
}
