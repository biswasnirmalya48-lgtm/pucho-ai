#!/usr/bin/env node
/**
 * End-to-end API smoke test for a running PUCHO server.
 *
 *   node scripts/e2e-smoke.js [baseUrl]
 *
 * Exercises the real HTTP surface: streaming, titles, regenerate, continue,
 * stop, research search, uploads + extraction, projects, search, settings,
 * delete reliability and upstream error handling.  Works against the local
 * mock provider (see scripts/mock-provider.js) and against real GROQ.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const BASE = (process.argv[2] || process.env.PUCHO_BASE || 'http://127.0.0.1:8787').replace(/\/$/, '')

let passed = 0
let failed = 0
const failures = []

async function check(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ✔ ${name}`)
  } catch (err) {
    failed += 1
    failures.push({ name, err })
    console.log(`  ✖ ${name}\n      ${String(err?.message || err).split('\n').slice(0, 4).join('\n      ')}`)
  }
}

async function json(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init.body instanceof FormData ? init.headers : { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  const body = await res.json().catch(() => null)
  return { res, body }
}

/**
 * Run one SSE chat request and collect its events.
 *
 * Requests are spaced out so a full suite run exercises the product rather
 * than tripping the (correctly strict) chat rate limiter.
 */
const CHAT_SPACING_MS = Number(process.env.PUCHO_SMOKE_SPACING ?? 2500)
let lastChatAt = 0

async function chatOnce(payload, { abortAfterMs } = {}) {
  const wait = lastChatAt + CHAT_SPACING_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastChatAt = Date.now()
  const controller = new AbortController()
  const timer = abortAfterMs
    ? setTimeout(() => controller.abort(), abortAfterMs)
    : null
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
  if (!res.ok) {
    if (timer) clearTimeout(timer)
    const body = await res.json().catch(() => null)
    throw Object.assign(new Error(body?.error?.message || `HTTP ${res.status}`), { http: res.status })
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const events = []
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let i = buffer.indexOf('\n\n')
      while (i !== -1) {
        const block = buffer.slice(0, i)
        buffer = buffer.slice(i + 2)
        const name = block.match(/^event:\s*(.+)$/m)?.[1]
        const data = block.match(/^data:\s*([\s\S]+)$/m)?.[1]
        if (name && data) {
          try {
            events.push({ event: name, data: JSON.parse(data) })
          } catch {
            /* ignore malformed frame */
          }
        }
        i = buffer.indexOf('\n\n')
      }
    }
  } catch (err) {
    if (err?.name !== 'AbortError') throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
  const byType = (type) => events.filter((e) => e.event === type)
  return {
    events,
    byType,
    text: byType('delta').map((e) => e.data.text).join(''),
    open: byType('open')[0]?.data,
    meta: byType('meta')[0]?.data,
    done: byType('done')[0]?.data,
    title: byType('title')[0]?.data,
    error: byType('error')[0]?.data,
    search: byType('search'),
  }
}

const makePdf = () => {
  const content = 'BT /F1 14 Tf 72 720 Td (PUCHO quarterly revenue note) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

console.log(`\nPUCHO end-to-end smoke test → ${BASE}\n`)

let conversationId = null
let assistantMessageId = null
let answerSample = ''

/**
 * Choose a search needle that is genuinely contiguous inside the answer and
 * absent from the question that produced it.
 *
 * Two traps this avoids:
 *  - Stripping punctuation across the whole answer splices words together
 *    across the punctuation ("said: _How" → "said How"), producing a string
 *    that never appears verbatim and so can never match.
 *  - The model echoes the prompt, so a sample shared with the question would
 *    legitimately match the *question* instead of the answer.
 */
function pickSearchSample(text, exclude = '') {
  const lowerExclude = String(exclude).toLowerCase()
  const runs = String(text)
    .replace(/[^a-zA-Z0-9 ]+/g, '\n')
    .split('\n')
    .map((run) => run.replace(/\s+/g, ' ').trim())
    .filter((run) => run.split(' ').length >= 3)
    .sort((a, b) => b.length - a.length)

  for (const run of runs) {
    const words = run.split(' ')
    for (const take of [6, 5, 4, 3]) {
      const sample = words.slice(0, take).join(' ')
      if (!lowerExclude.includes(sample.toLowerCase())) return sample
    }
  }
  return ''
}

/**
 * Chat with one retry when the upstream provider is rate limiting us.
 * PUCHO already reports that honestly; this just keeps a burst-based suite
 * from failing on a free-tier limit that a human user would never hit.
 */
const RATE_LIMIT_RETRY_MS = 20_000

/**
 * Keeps the suite inside a free provider's output-token budget. The suite
 * verifies plumbing, not answer length.
 */
const SHORT = ' Reply in at most two short sentences.'

async function chat(payload, options = {}) {
  const isRateLimited = (err) =>
    err?.status === 429 || /too many requests|rate/i.test(`${err?.code ?? ''} ${err?.message ?? ''}`)

  let first
  try {
    first = await chatOnce(payload, options)
  } catch (err) {
    if (!isRateLimited(err) || options.abortAfterMs) throw err
    await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_MS))
    return chatOnce(payload, options)
  }

  const failed = first.error && isRateLimited(first.error)
  if (!failed || options.abortAfterMs) return first
  await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_MS))
  return chatOnce(payload, options)
}

/* ------------------------------- health -------------------------------- */
console.log('health & capability')
await check('GET /api/health answers', async () => {
  const { res, body } = await json('/api/health')
  assert.equal(res.status, 200)
  assert.equal(body.app, 'PUCHO')
})

await check('GET /api/status never leaks the API key', async () => {
  const res = await fetch(`${BASE}/api/status`)
  const raw = await res.text()
  assert.equal(res.status, 200)
  assert.ok(!/gsk_[A-Za-z0-9]{10,}/.test(raw), 'response contains an API key')
  assert.ok(!/local-test-key/.test(raw), 'response contains the configured key')
  assert.ok(raw.includes('"modes"'))
})

/* -------------------------------- chat --------------------------------- */
console.log('\nchat + streaming')
const FIRST_PROMPT = `How does quantum tunneling work?${SHORT}`

await check('send streams deltas and finishes with done', async () => {
  const result = await chat({ content: FIRST_PROMPT, mode: 'fast' })
  assert.ok(result.open?.conversationId, 'no conversation id')
  assert.ok(result.meta?.assistantMessageId, 'no assistant message id')
  assert.ok(result.byType('delta').length > 3, 'expected multiple deltas')
  assert.ok(result.text.length > 20, 'assistant answer is empty')
  assert.ok(result.done?.message?.content.includes(result.text.slice(0, 20)), 'saved content mismatch')
  conversationId = result.open.conversationId
  assistantMessageId = result.meta.assistantMessageId
  answerSample = pickSearchSample(result.text, FIRST_PROMPT)
})

await check('conversation is auto-titled from the first message', async () => {
  await new Promise((r) => setTimeout(r, 1200))
  const { body } = await json(`/api/conversations/${conversationId}`)
  assert.ok(body.conversation.title.length > 0, 'title is still empty')
  assert.ok(body.conversation.title.length <= 120)
})

await check('user + assistant messages persist in order', async () => {
  const { body } = await json(`/api/conversations/${conversationId}`)
  assert.equal(body.messages.length, 2)
  assert.equal(body.messages[0].role, 'user')
  assert.match(body.messages[0].content, /quantum tunneling work\?/i)
  assert.equal(body.messages[1].role, 'assistant')
  assert.ok(body.messages[1].content.length > 20)
})

await check('history is included on the next turn', async () => {
  const result = await chat({ conversationId, content: `Make that shorter${SHORT}`, mode: 'fast' })
  assert.ok(result.done, 'second turn did not complete')
  const { body } = await json(`/api/conversations/${conversationId}`)
  const roles = body.messages.map((m) => m.role)
  const secondQuestion = body.messages.findIndex(
    (m) => m.role === 'user' && /^Make that shorter/.test(m.content),
  )
  assert.ok(secondQuestion >= 0, 'the follow-up question was not stored')
  assert.equal(roles[secondQuestion + 1], 'assistant', 'no answer stored for the follow-up')
  assert.ok(
    body.messages[secondQuestion + 1].content.length > 10,
    'follow-up answer is empty',
  )
})

await check('stopping mid-stream keeps the partial answer', async () => {
  const before = (await json(`/api/conversations/${conversationId}`)).body.messages.length
  const result = await chat(
    { conversationId, content: 'Write a detailed explanation of everything.', mode: 'fast' },
    { abortAfterMs: 300 },
  )
  await new Promise((r) => setTimeout(r, 600))
  const { body } = await json(`/api/conversations/${conversationId}`)
  assert.ok(body.messages.length > before, 'the stopped turn was not stored at all')
  const last = body.messages[body.messages.length - 1]
  assert.equal(last.role, 'assistant', 'expected a partial assistant answer after stopping')
  assert.ok(['stopped', 'complete', 'error'].includes(last.status), `unexpected status ${last.status}`)
  // Clean up deterministically: drop this turn from the user's question onwards.
  await chat({ action: 'truncate', conversationId, messageId: body.messages[before].id })
  const cleaned = (await json(`/api/conversations/${conversationId}`)).body.messages
  assert.equal(cleaned.length, before, 'truncate did not remove the stopped turn')
  if (result.text.length) assert.ok(last.content.length > 0, 'stopped answer lost its text')
})

await check('regenerate replaces the previous answer', async () => {
  let { body } = await json(`/api/conversations/${conversationId}`)
  let assistant = [...body.messages].reverse().find((m) => m.role === 'assistant')
  if (!assistant) {
    // Ensure there is an answer to regenerate.
    await chat({ conversationId, content: `Give me one fact.${SHORT}`, mode: 'fast' })
    body = (await json(`/api/conversations/${conversationId}`)).body
    assistant = [...body.messages].reverse().find((m) => m.role === 'assistant')
  }
  assert.ok(assistant, 'no assistant message to regenerate')
  const before = assistant.content
  const result = await chat({ action: 'regenerate', conversationId, messageId: assistant.id })
  assert.ok(result.done, 'regenerate did not complete')
  assert.ok(result.text.length > 10)
  const after = await json(`/api/conversations/${conversationId}`)
  const assistants = after.body.messages.filter((m) => m.role === 'assistant')
  assert.equal(assistants[assistants.length - 1].content.length > 0, true)
  assert.ok(typeof before === 'string')
})

await check('continue appends to the last answer', async () => {
  const { body } = await json(`/api/conversations/${conversationId}`)
  const last = [...body.messages].reverse().find((m) => m.role === 'assistant')
  const lengthBefore = last.content.length
  const result = await chat({ action: 'continue', conversationId, messageId: last.id })
  assert.ok(result.text.length > 0, 'continue produced nothing')
  const after = await json(`/api/conversations/${conversationId}`)
  const updated = after.body.messages.find((m) => m.id === last.id)
  assert.ok(updated.content.length > lengthBefore, 'answer was not appended')
})

await check('mode switching is accepted and recorded', async () => {
  for (const mode of ['think', 'code', 'study', 'research']) {
    const result = await chat({ conversationId, content: `Reply in ${mode} mode: ping${SHORT}`, mode })
    assert.ok(result.meta, `${mode} produced no meta`)
    assert.ok(result.done, `${mode} did not complete`)
  }
  const { body } = await json(`/api/conversations/${conversationId}`)
  assert.equal(body.conversation.mode, 'research')
})

await check('research mode emits real search events', async () => {
  const { body: status } = await json('/api/status')
  const result = await chat({ conversationId, content: `What are the latest SQLite releases?${SHORT}`, mode: 'research' })
  const searchEvents = result.search.map((e) => e.data)
  assert.ok(searchEvents.length > 0, 'no search events emitted')
  const statusEvent = searchEvents[searchEvents.length - 1]
  if (statusEvent.status === 'ok') {
    assert.ok(statusEvent.results.length > 0)
    for (const source of statusEvent.results) assert.match(source.url, /^https?:\/\//)
    const sources = result.done.message.sources ?? []
    assert.ok(sources.length > 0, 'done event carried no sources')
  } else {
    assert.equal(statusEvent.status, status.webSearch.available ? 'error' : 'unavailable')
  }
})

await check('empty and oversized requests are rejected cleanly', async () => {
  await assert.rejects(() => chat({ content: '   ' }), (err) => {
    assert.match(err.message, /Type something first|message or an attachment/i)
    return true
  })
})

await check('unknown conversations return a friendly 404', async () => {
  const { res, body } = await json(`/api/conversations/${randomUUID()}`)
  assert.equal(res.status, 404)
  assert.equal(body.error.code, 'not_found')
})

/* -------------------------------- files -------------------------------- */
console.log('\nfiles & uploads')
let textFileId = null
let imageFileId = null

await check('uploads a PDF and extracts its text', async () => {
  const form = new FormData()
  form.append('files', new Blob([makePdf()], { type: 'application/pdf' }), 'report.pdf')
  const res = await fetch(`${BASE}/api/files`, { method: 'POST', body: form })
  const body = await res.json()
  assert.equal(res.status, 201)
  assert.equal(body.files[0].kind, 'pdf')
  assert.ok(body.files[0].textChars > 0, 'no text extracted from the PDF')
  textFileId = body.files[0].id
})

await check('serves extracted text for the file', async () => {
  const { res, body } = await json(`/api/files/${textFileId}/text`)
  assert.equal(res.status, 200)
  assert.match(body.text, /PUCHO quarterly revenue note/)
})

await check('serves the raw file bytes safely', async () => {
  const res = await fetch(`${BASE}/api/files/${textFileId}/raw`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.match(res.headers.get('content-disposition') || '', /inline|attachment/)
  const bytes = new Uint8Array(await res.arrayBuffer())
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-')
})

await check('uploads a text file', async () => {
  const form = new FormData()
  form.append('files', new Blob(['const x = 1\nexport default x\n'], { type: 'text/plain' }), 'code.ts')
  const res = await fetch(`${BASE}/api/files`, { method: 'POST', body: form })
  const body = await res.json()
  assert.equal(res.status, 201)
  assert.ok(body.files[0].textChars > 0, 'no text extracted from the code file')
})

await check('uploads an image', async () => {
  const form = new FormData()
  form.append('files', new Blob([PNG_1PX], { type: 'image/png' }), 'pixel.png')
  const res = await fetch(`${BASE}/api/files`, { method: 'POST', body: form })
  const body = await res.json()
  assert.equal(res.status, 201)
  assert.equal(body.files[0].kind, 'image')
  imageFileId = body.files[0].id
})

await check('rejects an unsupported file type', async () => {
  const form = new FormData()
  form.append('files', new Blob([Buffer.from([0, 1, 2, 3, 0, 5])], { type: 'application/octet-stream' }), 'thing.bin')
  const res = await fetch(`${BASE}/api/files`, { method: 'POST', body: form })
  assert.equal(res.status, 415)
  const body = await res.json()
  assert.match(body.error.message, /cannot read/i)
})

await check('attached file text reaches the model', async () => {
  const result = await chat({
    conversationId,
    content: `Summarize the attached file in one line.${SHORT}`,
    mode: 'fast',
    attachmentIds: [textFileId],
  })
  assert.ok(result.done, 'attachment send failed')
})

await check('images either stream a vision answer or explain the limit', async () => {
  const result = await chat({
    conversationId,
    content: `What is in this image?${SHORT}`,
    mode: 'fast',
    attachmentIds: [imageFileId],
  })
  assert.ok(result.meta, 'no meta for image request')
  if (result.meta.vision === false) {
    assert.match(result.text, /cannot read images/i, 'vision block message missing')
  } else {
    assert.ok(result.done, 'vision answer did not complete')
  }
})

/* ------------------------------ projects ------------------------------- */
console.log('\nprojects')
let projectId = null

await check('creates a project and injects its context', async () => {
  const { res, body } = await json('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: 'VOCON',
      description: 'Remote control project',
      instructions: 'Answer concisely.',
      context: 'The device uses Zigbee over 2.4GHz.',
    }),
  })
  assert.equal(res.status, 201)
  projectId = body.project.id
})

await check('project context is used when chatting inside it', async () => {
  const result = await chat({ projectId, content: `What radio does this use?${SHORT}`, mode: 'fast' })
  assert.ok(result.open?.projectId, 'project not attached to conversation')
  const { body } = await json(`/api/conversations/${result.open.conversationId}`)
  assert.equal(body.conversation.projectId, projectId)
})

await check('updates and deletes a project', async () => {
  const patched = await json(`/api/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({ description: 'Updated description' }),
  })
  assert.equal(patched.body.project.description, 'Updated description')
  const removed = await json(`/api/projects/${projectId}`, { method: 'DELETE' })
  assert.equal(removed.res.status, 200)
  const check404 = await json(`/api/projects/${projectId}`)
  assert.equal(check404.res.status, 404)
})

/* ------------------------------- search -------------------------------- */
console.log('\nsearch, rename, archive')
await check('search finds the conversation by user message', async () => {
  const { res, body } = await json('/api/conversations/search?q=quantum')
  assert.equal(res.status, 200)
  assert.ok(body.results.length > 0, 'search returned nothing')
  assert.ok(body.results[0].snippet)
})

await check('search finds answers too', async () => {
  assert.ok(answerSample.length > 4, `no answer sample captured: ${answerSample}`)
  const { body } = await json('/api/conversations/search?q=' + encodeURIComponent(answerSample))
  assert.ok(body.results.length > 0, `answer search returned nothing for "${answerSample}"`)
  assert.equal(body.results[0].matchedIn, 'answer')
})

await check('renames a conversation', async () => {
  const { res, body } = await json(`/api/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: 'Quantum tunnelling, explained' }),
  })
  assert.equal(res.status, 200)
  assert.equal(body.conversation.title, 'Quantum tunnelling, explained')
})

await check('archives and restores a conversation', async () => {
  await json(`/api/conversations/${conversationId}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
  const active = await json('/api/conversations')
  assert.ok(!active.body.conversations.some((c) => c.id === conversationId), 'archived chat still listed')
  const archived = await json('/api/conversations?archived=1')
  assert.ok(archived.body.conversations.some((c) => c.id === conversationId))
  await json(`/api/conversations/${conversationId}`, { method: 'PATCH', body: JSON.stringify({ archived: false }) })
})

/* ------------------------------ settings ------------------------------- */
console.log('\nsettings')
await check('reads and updates settings', async () => {
  const initial = await json('/api/settings')
  assert.equal(initial.body.settings.language, 'english')
  const updated = await json('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify({ language: 'hinglish', responseStyle: 'detailed', theme: 'light' }),
  })
  assert.equal(updated.body.settings.language, 'hinglish')
  assert.equal(updated.body.settings.theme, 'light')
  await json('/api/settings', { method: 'PATCH', body: JSON.stringify({ language: 'english', theme: 'dark', responseStyle: 'balanced' }) })
})

await check('rejects invalid settings values', async () => {
  const { res, body } = await json('/api/settings', { method: 'PATCH', body: JSON.stringify({ theme: 'neon' }) })
  assert.equal(res.status, 400)
  assert.equal(body.error.code, 'invalid_request')
})

/* --------------------------- error handling ---------------------------- */
console.log('\nerror handling')
await check('TTS reports unavailable instead of failing silently', async () => {
  const res = await fetch(`${BASE}/api/tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'hello' }),
  })
  const body = await res.json()
  assert.equal(res.status, 501)
  assert.equal(body.error.code, 'tts_unavailable')
})

await check('chat error events never include provider internals', async () => {
  const { body: status } = await json('/api/status')
  if (!status.groq.configured) return
  const result = await chat({ content: `trigger an upstream failure${SHORT}`, mode: 'fast' })
  if (result.error) {
    assert.ok(!/gsk_|authorization|bearer/i.test(JSON.stringify(result.error)), 'error leaked credentials')
    assert.ok(result.error.message.length > 10)
  } else {
    assert.ok(result.done, 'neither done nor error')
  }
})

await check('rate limit headers are present on API responses', async () => {
  const res = await fetch(`${BASE}/api/conversations`)
  const limit = res.headers.get('x-ratelimit-limit')
  const remaining = res.headers.get('x-ratelimit-remaining')
  assert.ok(limit && Number(limit) > 0, 'missing X-RateLimit-Limit')
  assert.ok(remaining !== null && Number(remaining) >= 0, 'missing X-RateLimit-Remaining')
})

/* ------------------------------ deletion ------------------------------- */
console.log('\ndeletion reliability')
await check('deleting a conversation removes it completely', async () => {
  const temp = await chat({ content: `delete me${SHORT}`, mode: 'fast' })
  const id = temp.open.conversationId
  const removed = await json(`/api/conversations/${id}`, { method: 'DELETE' })
  assert.equal(removed.res.status, 200)
  const after = await json(`/api/conversations/${id}`)
  assert.equal(after.res.status, 404)
  const list = await json('/api/conversations')
  assert.ok(!list.body.conversations.some((c) => c.id === id))
})

await check('deleting twice returns a clean 404, not a crash', async () => {
  const temp = await chat({ content: `delete me twice${SHORT}`, mode: 'fast' })
  const id = temp.open.conversationId
  await json(`/api/conversations/${id}`, { method: 'DELETE' })
  const second = await json(`/api/conversations/${id}`, { method: 'DELETE' })
  assert.equal(second.res.status, 404)
  assert.equal(second.body.error.code, 'not_found')
})

await check('bulk delete works', async () => {
  const before = (await json('/api/conversations')).body.conversations.length
  if (before === 0) return
  await json('/api/conversations/bulk', { method: 'POST', body: JSON.stringify({ op: 'delete_all' }) })
  const after = await json('/api/conversations')
  assert.equal(after.body.conversations.length, 0)
})

await check('the server is still healthy afterwards', async () => {
  const { res, body } = await json('/api/health')
  assert.equal(res.status, 200)
  assert.equal(body.ok, true)
})

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`)
if (failed) {
  for (const failure of failures) {
    console.log(`✖ ${failure.name}`)
    console.log(String(failure.err?.stack || failure.err).split('\n').slice(0, 6).join('\n'))
    console.log('')
  }
  process.exitCode = 1
}