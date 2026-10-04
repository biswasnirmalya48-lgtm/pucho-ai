#!/usr/bin/env node
/**
 * Local stub for the providers PUCHO talks to (GROQ-compatible chat API and a
 * Tavily-compatible search endpoint).
 *
 * WHY THIS EXISTS
 * ---------------
 * It lets you exercise the full streaming pipeline — SSE deltas, titles, stop,
 * regenerate, research search, error states — without spending tokens or
 * waiting on a network.  PUCHO itself never fabricates answers: point
 * GROQ_API_URL at your real endpoint (or leave the default) for real usage.
 *
 * Usage (from the project root):
 *   node scripts/mock-provider.js            # serves on http://127.0.0.1:9090
 *
 * Then in .env:
 *   GROQ_API_URL=http://127.0.0.1:9090/v1
 *   GROQ_API_KEY=local-test-key
 *   GROQ_MODEL=mock-versatile
 *   WEB_SEARCH_PROVIDER=tavily
 *   TAVILY_API_KEY=local-test-key
 *   TAVILY_API_URL=http://127.0.0.1:9090/search
 *
 * Special model ids trigger specific failures for testing error handling:
 *   mock-401  → invalid key        mock-429 → rate limited
 *   mock-500  → server error       mock-slow → very slow stream (test stop)
 *   mock-empty → empty response    mock-vision → a vision-capable model
 */
import http from 'node:http'

const PORT = Number(process.env.MOCK_PORT || 9090)
const HOST = process.env.MOCK_HOST || '127.0.0.1'

const MODELS = [
  'mock-versatile',
  'mock-reasoning',
  'mock-vision',
  'mock-401',
  'mock-429',
  'mock-500',
  'mock-slow',
  'mock-empty',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function reply(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(payload)
}

/** Build a short, obviously synthetic answer that echoes what PUCHO asked. */
function answerFor(messages) {
  const last = [...messages].reverse().find((m) => typeof m.content === 'string' && m.content.trim())
  const prompt = (last?.content ?? '').trim()
  const hasProject = /## Project context/.test(messages[0]?.content ?? '')
  const hasSources = /## Live web search results/.test(messages[0]?.content ?? '')
  return [
    `**Mock provider reply.** You said: _${prompt.slice(0, 120) || '(nothing)'}_`,
    '',
    '## What this proves',
    '',
    '1. Streaming works — these tokens arrived over SSE.',
    '2. Markdown renders: headings, lists, tables and code.',
    '',
    '| Feature | Status |',
    '| --- | --- |',
    '| Streaming | ok |',
    `| Project context | ${hasProject ? 'injected' : 'none'} |`,
    `| Live sources | ${hasSources ? 'injected' : 'none'} |`,
    '',
    '```js',
    'const pucho = "Bas Pucho."',
    'console.log(pucho)',
    '```',
    '',
    '$$E = mc^2$$',
  ].join('\n')
}

function shortTitle(messages) {
  const last = [...messages].reverse().find((m) => m.role === 'user' && typeof m.content === 'string')
  const text = (last?.content ?? 'New chat').trim()
  return text.split(/\s+/).slice(0, 6).join(' ')
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (url.pathname.endsWith('/models')) {
    if (req.headers.authorization === 'Bearer invalid-key') {
      return reply(res, 401, { error: { code: 'invalid_api_key', message: 'Invalid API Key' } })
    }
    return reply(res, 200, { object: 'list', data: MODELS.map((id) => ({ id, object: 'model' })) })
  }

  if (url.pathname === '/search') {
    // Tavily-compatible search stub. Only real provider output reaches the UI.
    let query = ''
    if (req.method === 'POST') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      try {
        query = JSON.parse(Buffer.concat(chunks).toString('utf8'))?.query ?? ''
      } catch {
        query = ''
      }
    } else {
      query = url.searchParams.get('q') ?? ''
    }
    return reply(res, 200, {
      results: [
        {
          title: `Mock result for "${query}"`,
          url: 'https://example.com/mock-source-1',
          content: 'This URL came from the local stub provider, not from a real search.',
        },
        {
          title: `Second mock result for "${query}"`,
          url: 'https://example.org/mock-source-2',
          content: 'PUCHO cites only sources the provider actually returned.',
        },
      ],
    })
  }

  if (!url.pathname.includes('/chat/completions')) {
    return reply(res, 404, { error: { message: 'Unknown mock endpoint' } })
  }

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  let body = {}
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return reply(res, 400, { error: { message: 'Invalid JSON body' } })
  }

  const auth = req.headers.authorization ?? ''
  if (auth === 'Bearer invalid-key' || !auth.startsWith('Bearer ') || auth.length < 10) {
    return reply(res, 401, { error: { code: 'invalid_api_key', message: 'Invalid API Key' } })
  }

  const model = String(body.model ?? '')
  const messages = Array.isArray(body.messages) ? body.messages : []

  if (model.includes('401')) {
    return reply(res, 401, { error: { code: 'invalid_api_key', message: 'Invalid API Key' } })
  }
  if (model.includes('429')) {
    return reply(res, 429, { error: { code: 'rate_limit_exceeded', message: 'Rate limit reached' } })
  }
  if (model.includes('500')) {
    return reply(res, 500, { error: { message: 'Internal server error' } })
  }
  if (model.includes('404')) {
    return reply(res, 404, {
      error: { code: 'model_not_found', message: 'The model does not exist' },
    })
  }

  if (body.stream === false) {
    // Used for conversation titles.
    return reply(res, 200, {
      choices: [{ message: { role: 'assistant', content: shortTitle(messages) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 },
    })
  }

  const slow = model.includes('slow')
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })

  const isReasoning = model.includes('reasoning')
  const send = (chunk) => res.write(`data: ${JSON.stringify(chunk)}\n\n`)

  if (isReasoning) {
    send({ choices: [{ delta: { reasoning: 'Considering the request…' } }] })
    await sleep(60)
  }

  const text = model.includes('empty') ? '   ' : answerFor(messages)
  const words = text.split(/(\s+)/)

  for (const piece of words) {
    if (!piece) continue
    send({ choices: [{ delta: { content: piece } }] })
    await sleep(slow ? 350 : 12)
    if (res.writableEnded) return
  }

  send({ choices: [{ delta: {}, finish_reason: 'stop' }] })
  res.write('data: [DONE]\n\n')
  res.end()
})

server.listen(PORT, HOST, () => {
  console.log(`[mock-provider] GROQ-compatible API on http://${HOST}:${PORT}/v1`)
  console.log(`[mock-provider] search stub on http://${HOST}:${PORT}/search`)
})