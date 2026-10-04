/**
 * 404 + error handling.
 *
 * Detailed errors (including anything from an upstream provider) are logged
 * server-side only; clients get a human-readable message and a stable code.
 */
import { ValidationError } from '../lib/validate.js'
import { UpstreamError, FRIENDLY_MESSAGES } from '../services/groq.js'
import { NODE_ENV } from '../config.js'

let requestCounter = 0
export function requestId() {
  requestCounter += 1
  return `req_${Date.now().toString(36)}_${requestCounter}`
}

export function logger(req, level, message, meta) {
  const line = {
    level,
    reqId: req?.id,
    method: req?.method,
    path: req?.originalUrl?.split('?')[0],
    message,
    ...meta,
  }
  const out = level === 'error' ? console.error : console.log
  out(`[pucho] ${JSON.stringify(line)}`)
}

export function notFound(req, res) {
  res.status(404).json({
    error: { code: 'not_found', message: `No PUCHO endpoint for ${req.method} ${req.path}.` },
  })
}

/** Turn any thrown value into a safe response payload. */
export function toPublicError(err) {
  if (err instanceof ValidationError) {
    return { status: err.status, code: err.code, message: err.message }
  }
  if (err instanceof UpstreamError) {
    return { status: err.status, code: err.code, message: err.message, retryable: err.retryable }
  }
  if (err?.code === 'conversation_limit') {
    return {
      status: 409,
      code: 'conversation_limit',
      message: 'You have reached the maximum number of conversations. Delete or archive an old one to make room.',
    }
  }
  if (err?.code === 'not_found') {
    return { status: 404, code: 'not_found', message: err.message || 'That item no longer exists.' }
  }
  if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE' || err?.code === 'LIMIT_EXPRESSED_FILE') {
    return { status: 413, code: 'too_large', message: 'That file is too large for PUCHO to accept.' }
  }
  if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return { status: 400, code: 'invalid_file', message: 'That file type is not supported by PUCHO.' }
  }
  return {
    status: 500,
    code: 'internal_error',
    message: FRIENDLY_MESSAGES.server,
  }
}

export function errorHandler(err, req, res, _next) {
  const publicError = toPublicError(err)
  const detail =
    err instanceof UpstreamError ? err.detail : { name: err?.name, message: err?.message, stack: NODE_ENV === 'production' ? undefined : err?.stack }
  if (publicError.status >= 500) {
    logger(req, 'error', publicError.message, { code: publicError.code, detail })
  } else {
    logger(req, 'warn', publicError.message, { code: publicError.code })
  }
  if (res.headersSent) {
    try {
      res.end()
    } catch {
      /* client already gone */
    }
    return
  }
  res.status(publicError.status).json({
    error: { code: publicError.code, message: publicError.message, retryable: !!publicError.retryable },
  })
}