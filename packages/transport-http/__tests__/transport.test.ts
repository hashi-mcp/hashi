import { AuthError, TransportError } from '@hashi-mcp/core'
import { describe, expect, it, vi } from 'vitest'

import { httpTransport } from '../src/index.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

type FetchFn = typeof globalThis.fetch

describe('httpTransport', () => {
  it('throws on construction without endpoint', () => {
    expect(() => httpTransport({ endpoint: '' as unknown as string })).toThrow(TransportError)
  })

  it('connect skips ping when pingPath is null', async () => {
    const fetch = vi.fn(async () => jsonResponse({ jsonrpc: '2.0', id: 1, result: 'unused' }))
    const t = httpTransport({
      endpoint: 'http://localhost:1234',
      pingPath: null,
      fetch: fetch as unknown as FetchFn,
    })
    await t.connect()
    expect(t.isConnected()).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('connect pings the configured pingPath and succeeds on 200', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe('http://localhost:1234/_hashi/ping')
      return new Response('ok', { status: 200 })
    })
    const t = httpTransport({
      endpoint: 'http://localhost:1234',
      fetch: fetch as unknown as FetchFn,
    })
    await t.connect()
    expect(t.isConnected()).toBe(true)
  })

  it('connect raises AuthError on 401', async () => {
    const fetch = vi.fn(async () => new Response('nope', { status: 401 }))
    const t = httpTransport({
      endpoint: 'http://localhost:1234',
      fetch: fetch as unknown as FetchFn,
    })
    await expect(t.connect()).rejects.toBeInstanceOf(AuthError)
  })

  it('call posts JSON-RPC and returns the result', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined

    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url)
      capturedInit = init
      return jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: { workbooks: ['a.xlsx', 'b.xlsx'] },
      })
    })

    const t = httpTransport({
      endpoint: 'http://localhost:1234',
      pingPath: null,
      token: 'secret-token',
      fetch: fetch as unknown as FetchFn,
    })
    await t.connect()
    const out = await t.call<{ workbooks: string[] }>('workbook.list')
    expect(out.workbooks).toEqual(['a.xlsx', 'b.xlsx'])

    expect(capturedUrl).toBe('http://localhost:1234/rpc')
    expect(capturedInit?.method).toBe('POST')

    const headers = new Headers(capturedInit?.headers)
    expect(headers.get('authorization')).toBe('Bearer secret-token')
    expect(headers.get('content-type')).toBe('application/json')

    const sentBody = JSON.parse(String(capturedInit?.body))
    expect(sentBody).toMatchObject({
      jsonrpc: '2.0',
      method: 'workbook.list',
      id: expect.any(Number),
    })
  })

  it('call surfaces JSON-RPC error as TransportError', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32601, message: 'Method not found' },
      }),
    )
    const t = httpTransport({
      endpoint: 'http://localhost:1234',
      pingPath: null,
      fetch: fetch as unknown as FetchFn,
    })
    await t.connect()
    await expect(t.call('does.not.exist')).rejects.toThrow(/Method not found/)
  })

  it('call raises AuthError on 403', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
    const t = httpTransport({
      endpoint: 'http://localhost:1234',
      fetch: fetch as unknown as FetchFn,
    })
    await t.connect()
    await expect(t.call('whatever')).rejects.toBeInstanceOf(AuthError)
  })

  it('resolves token from a function for rotation', async () => {
    const captured: Array<RequestInit | undefined> = []
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured.push(init)
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: 'ok' })
    })
    let counter = 0
    const t = httpTransport({
      endpoint: 'http://localhost:1234',
      pingPath: null,
      token: () => `token-${++counter}`,
      fetch: fetch as unknown as FetchFn,
    })
    await t.connect()
    await t.call('a')
    await t.call('b')
    expect(new Headers(captured[0]?.headers).get('authorization')).toBe('Bearer token-1')
    expect(new Headers(captured[1]?.headers).get('authorization')).toBe('Bearer token-2')
  })
})
