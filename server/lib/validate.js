/**
 * Input validation + light sanitisation shared by every route.
 * Fails fast with a ValidationError that the error handler turns into a
 * friendly 400 response.
 */
import { LIMITS } from '../config.js'

export class ValidationError extends Error {
  constructor(message, { code = 'invalid_request', field = null, status = 400 } = {}) {
    super(message)
    this.name = 'ValidationError'
    this.code = code
    this.field = field
    this.status = status
  }
}

/** Remove control characters that can break rendering or logs. */
export function sanitizeText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

export function requireString(value, { field = 'value', max = 1000, min = 0, trim = true } = {}) {
  if (typeof value !== 'string') throw new ValidationError(`${field} must be text.`, { field })
  let out = trim ? value.trim() : value
  if (out.length < min) throw new ValidationError(`${field} is required.`, { field })
  if (out.length > max) out = out.slice(0, max)
  return out
}

export function optionalString(value, opts = {}) {
  if (value === undefined || value === null || value === '') return null
  return requireString(value, opts)
}

export function requireOneOf(value, allowed, { field = 'value', fallback = null } = {}) {
  if (value === undefined || value === null || value === '') return fallback
  if (!allowed.includes(value)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}.`, { field })
  }
  return value
}

export function requireBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export function requireInt(value, { field = 'value', min = 0, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) {
    // Query strings are often noisy; prefer the fallback over a hard failure.
    if (fallback !== undefined) return fallback
    throw new ValidationError(`${field} must be a number.`, { field })
  }
  return Math.min(max, Math.max(min, n))
}

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/

export function requireId(value, { field = 'id' } = {}) {
  const id = requireString(value, { field, max: 64 })
  if (!ID_RE.test(id)) throw new ValidationError(`${field} is not a valid identifier.`, { field })
  return id
}

export function optionalId(value, { field = 'id' } = {}) {
  if (value === undefined || value === null || value === '') return null
  return requireId(value, { field })
}

export function requireIdArray(value, { field = 'ids', max = LIMITS.filesPerMessage } = {}) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be a list.`, { field })
  if (value.length > max) throw new ValidationError(`Too many items (max ${max}).`, { field })
  return value.filter(Boolean).map((v) => requireId(v, { field }))
}

/** Validate the body of POST /api/chat. */
export function validateChatBody(body = {}) {
  if (!body || typeof body !== 'object') throw new ValidationError('Invalid request body.')
  const action = requireOneOf(body.action, ['send', 'regenerate', 'continue', 'truncate'], {
    field: 'action',
    fallback: 'send',
  })

  const base = {
    action,
    conversationId: optionalId(body.conversationId, { field: 'conversationId' }),
    projectId: optionalId(body.projectId, { field: 'projectId' }),
    mode: body.mode ?? null,
    attachmentIds: requireIdArray(body.attachmentIds),
    messageId: optionalId(body.messageId, { field: 'messageId' }),
    useSearch: requireBool(body.useSearch, true),
  }

  if (action === 'send') {
    const content = sanitizeText(
      requireString(body.content ?? '', { field: 'content', max: LIMITS.messageChars }),
    ).trim()
    if (!content && !base.attachmentIds.length) {
      throw new ValidationError('Type something first — PUCHO needs a message or an attachment.')
    }
    return {
      ...base,
      content: content || 'Please read the attached file(s) and tell me what they contain.',
    }
  }

  if (action !== 'truncate' && !base.messageId) {
    throw new ValidationError(`${action} needs a messageId.`, { field: 'messageId' })
  }
  return base
}