/**
 * Thin, dependency-free GROQ client (OpenAI-compatible chat completions).
 *
 * Everything that talks to GROQ goes through this module, and nothing but
 * this module ever reads `GROQ.apiKey`.  Upstream failures are translated
 * into `UpstreamError`s that carry a safe, human-readable message; the raw
 * provider payload is kept for server-side logs only.
 */
import { GROQ } from '../config.js'

export class UpstreamError extends Error {
  constructor({ userMessage, status = 502, code = 'upstream_error', detail = null, retryable = false }) {
    super(userMessage)
    this.name = 'UpstreamError'
    this.status = status
    this.code = code
    this.detail = detail
    this.retryable = retryable
  }
}

const FRIENDLY = {
  auth:
    "PUCHO couldn't connect right now. Check your API configuration and try again.",
  rate:
    "PUCHO is getting too many requests at once. Give it a second, then try again.",
  timeout:
    'PUCHO took too long to answer that one. Try again, or send a shorter message.',
  network:
    "PUCHO lost the connection to the model. Check your network and try again.",
  model:
    "That model isn't available on this account right now. Try a different mode, or update the model in your environment settings.",
  invalid: "That request couldn't be processed. Try rephrasing or shortening your message.",
  server: 'The model service had a problem on its end. Please try again in a moment.',
  empty: "PUCHO didn't get a usable answer back. Try rephrasing your question.",
  emptyVision:
    "The current model returned an empty answer. Try another mode or add a little more detail.",
}

export function publicMessageFor(err) {
  if (err instanceof UpstreamError) return err.message
  return FRIENDLY.network
}

function describeHttpError(status, body) {
  const upstreamCode = body?.error?.code || body?.error?.type || ''
  const message = String(body?.error?.message || '')
  if (status === 401 || status === 403) return FRIENDLY.auth
  if (status === 429) return FRIENDLY.rate
  if (status === 404 || /model_not_found|model.*not.*found|decommissioned/i.test(upstreamCode + message))
    return FRIENDLY.model
  if (status === 408 || status === 504) return FRIENDLY.timeout
  if (status === 413) return 'That message is too large for PUCHO to send. Trim it and try again.'
  if (status >= 400 && status < 500) return FRIENDLY.invalid
  return FRIENDLY.server
}

function httpError(status, body) {
  const upstreamCode = body?.error?.code || body?.error?.type || 'http_error'
  return new UpstreamError({
    userMessage: describeHttpError(status, body),
    status: status === 401 || status === 403 || status === 429 ? status : 502,
    code: upstreamCode,
    detail: { status, body: body ?? null },
    retryable: status === 429 || status >= 500,
  })
}

/** Build the fetch options + timeout wiring shared by every GROQ call. */
function requestInit(body, signal) {
  const timeout = AbortSignal.timeout(GROQ.requestTimeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  return {
    method: 'POST',
    signal: combined,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${GROQ.apiKey}`,
      'user-agent': 'PUCHO/1.0',
    },
    body: JSON.stringify(body),
  }
}

function networkError(cause, callerSignal) {
  const isTimeout = cause?.name === 'TimeoutError' || cause?.name === 'AbortError'
  if (callerSignal?.aborted || (cause?.name === 'AbortError' && !isTimeout)) {
    // Caller-initiated cancellation: routes treat this as "stopped", not a failure.
    return new UpstreamError({
      userMessage: FRIENDLY.network,
      status: 499,
      code: 'aborted',
      detail: { reason: 'caller_abort' },
    })
  }
  return new UpstreamError({
    userMessage: isTimeout ? FRIENDLY.timeout : FRIENDLY.network,
    status: 502,
    code: isTimeout ? 'timeout' : 'network_error',
    detail: { message: String(cause?.message || cause) },
    retryable: true,
  })
}

export function assertConfigured() {
  if (!GROQ.apiKey) {
    throw new UpstreamError({
      userMessage:
        "PUCHO isn't connected to a model yet. Add GROQ_API_KEY to your .env file, then restart the server.",
      status: 503,
      code: 'not_configured',
    })
  }
}

async function readJsonSafe(res) {
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { error: { message: text.slice(0, 400) } }
  }
}

/** List the models the configured key can actually reach. */
export async function listModels({ signal } = {}) {
  assertConfigured()
  const timeout = AbortSignal.timeout(15_000)
  const res = await fetch(`${GROQ.apiUrl}/models`, {
    method: 'GET',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { authorization: `Bearer ${GROQ.apiKey}`, accept: 'application/json' },
  }).catch((cause) => {
    throw networkError(cause, signal)
  })
  if (!res.ok) throw httpError(res.status, await readJsonSafe(res))
  const body = await readJsonSafe(res)
  const list = Array.isArray(body?.data) ? body.data : []
  return list
    .map((m) => ({ id: String(m?.id || ''), ...m }))
    .filter((m) => m.id)
}

/** Non-streaming completion (used for short internal jobs like titling). */
export async function complete({ messages, model, temperature = 0.2, maxTokens = 64, signal }) {
  assertConfigured()
  const init = requestInit(
    {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    },
    signal,
  )
  const res = await fetch(`${GROQ.apiUrl}/chat/completions`, init).catch((cause) => {
    throw networkError(cause, signal)
  })
  if (!res.ok) throw httpError(res.status, await readJsonSafe(res))
  const body = await readJsonSafe(res)
  const text = body?.choices?.[0]?.message?.content ?? ''
  return { text: String(text || '').trim(), raw: body }
}

/**
 * Stream a chat completion.  `onDelta` receives content deltas and
 * `onReasoning` receives reasoning-model deltas (used by THINK mode).
 */
export async function streamCompletion(options = {}) {
  // A provider-side rate limit (often output-tokens-per-minute) is usually
  // transient. If nothing has streamed to the user yet, wait it out once
  // instead of making them press send again.
  try {
    return await streamOnce(options)
  } catch (err) {
    const transientLimit =
      err instanceof UpstreamError && err.code === 'rate_limit_exceeded' && err.retryable
    if (!transientLimit || options.signal?.aborted) throw err
    await new Promise((resolve) => setTimeout(resolve, 2500))
    return streamOnce(options)
  }
}

async function streamOnce({
  messages,
  model,
  temperature = 0.6,
  maxTokens = GROQ.maxOutputTokens,
  signal,
  onDelta,
  onReasoning,
  onFirstToken,
} = {}) {
  assertConfigured()
  const init = requestInit({ model, messages, temperature, max_tokens: maxTokens, stream: true }, signal)
  const res = await fetch(`${GROQ.apiUrl}/chat/completions`, init).catch((cause) => {
    throw networkError(cause, signal)
  })

  if (!res.ok) throw httpError(res.status, await readJsonSafe(res))
  if (!res.body) {
    throw new UpstreamError({
      userMessage: FRIENDLY.empty,
      status: 502,
      code: 'empty_stream',
    })
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let reasoning = ''
  let finishReason = null
  let sawFirstToken = false
  let streamError = null

  const emitLine = (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
    if (!payload) return
    if (payload === '[DONE]') return
    let json
    try {
      json = JSON.parse(payload)
    } catch {
      return // ignore keep-alives / non-JSON frames
    }
    if (json?.error) {
      streamError = httpError(json?.error?.code === 'rate_limit_exceeded' ? 429 : 500, json)
      return
    }
    const delta = json?.choices?.[0]?.delta ?? json?.choices?.[0]?.message ?? {}
    if (typeof delta.reasoning === 'string' && delta.reasoning) {
      reasoning += delta.reasoning
      onReasoning?.(delta.reasoning)
    } else if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
      reasoning += delta.reasoning_content
      onReasoning?.(delta.reasoning_content)
    }
    const contentDelta = typeof delta.content === 'string' ? delta.content : ''
    if (contentDelta) {
      if (!sawFirstToken) {
        sawFirstToken = true
        onFirstToken?.()
      }
      content += contentDelta
      onDelta?.(contentDelta)
    }
    const reason = json?.choices?.[0]?.finish_reason
    if (reason) finishReason = reason
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        emitLine(line)
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) emitLine(buffer)
  } catch (cause) {
    reader.cancel().catch(() => {})
    throw networkError(cause, signal)
  }

  if (streamError) throw streamError
  if (!content.trim()) {
    throw new UpstreamError({
      userMessage: reasoning.trim() ? FRIENDLY.emptyVision : FRIENDLY.empty,
      status: 502,
      code: 'empty_response',
    })
  }
  return { content, reasoning, finishReason }
}

export const FRIENDLY_MESSAGES = FRIENDLY