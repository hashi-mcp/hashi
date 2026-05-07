# `@hashi-mcp/transport-http`

> HTTP/JSON-RPC localhost transport for Hashi bridges. Includes bearer auth, configurable timeouts, and token rotation.

## Install

```bash
pnpm add @hashi-mcp/core @hashi-mcp/transport-http
```

## Usage

```ts
import { defineBridge } from '@hashi-mcp/core'
import { httpTransport } from '@hashi-mcp/transport-http'

const bridge = defineBridge({
  app: { id: 'excel', name: 'Microsoft Excel' },
  transport: httpTransport({
    endpoint: 'http://127.0.0.1:7654',
    token: process.env.HASHI_EXCEL_TOKEN,
    timeoutMs: 10_000,
  }),
})

await bridge.connect()
const workbooks = await bridge.call('workbook.list')
```

## Wire format

The transport posts [JSON-RPC 2.0](https://www.jsonrpc.org/specification) requests:

```http
POST /rpc HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{ "jsonrpc": "2.0", "id": 1, "method": "workbook.list", "params": null }
```

Connection probing is done with an HTTP GET on `/_hashi/ping` (configurable, can be disabled).

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endpoint` | `string` | _required_ | Base URL of the host app's local HTTP server |
| `rpcPath` | `string` | `'/rpc'` | Path appended to `endpoint` for JSON-RPC calls |
| `pingPath` | `string \| null` | `'/_hashi/ping'` | Path used to probe liveness on `connect()`. `null` disables it |
| `token` | `string \| () => string \| Promise<string>` | _none_ | Bearer token, plain or resolved per call (rotation) |
| `timeoutMs` | `number` | `30_000` | Per-request timeout |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Override for tests or non-browser runtimes |

## Errors

- `TransportError` — connectivity, timeout, malformed response, JSON-RPC error
- `AuthError` — HTTP 401 / 403

Both inherit from `HashiError`.

## License

[MIT](../../LICENSE) © Alexandre Parena
