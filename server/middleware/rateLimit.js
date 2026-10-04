/**
 * Fixed-window rate limiting keyed by client IP.
 *
 * In-process and dependency-free by design: it protects a single-user or
 * small-team deployment out of the box.  Swap the `hits` map for Redis when
 * running multiple instances behind a load balancer.
 */
import { RATE_LIMITS } from '../config.js'

const hits = new Map()

const timer = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key)
  }
}, 60_000)
timer.unref?.()

export function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for']
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') ||
    req.socket?.remoteAddress ||
    'unknown'
  return String(ip).replace(/[^a-zA-Z0-9.:[\]]/g, '').slice(0, 64)
}

export function rateLimit(key = 'write') {
  const config = RATE_LIMITS[key] || RATE_LIMITS.write
  const bucket = Math.floor(Date.now() / config.windowMs)
  return (req, res, next) => {
    const id = `${key}:${clientKey(req)}:${bucket}`
    const entry = hits.get(id) || { count: 0 }
    entry.count += 1
    hits.set(id, entry)

    const remaining = Math.max(0, config.max - entry.count)
    res.setHeader('X-RateLimit-Limit', String(config.max))
    res.setHeader('X-RateLimit-Remaining', String(remaining))
    if (entry.count > config.max) {
      res.setHeader('Retry-After', String(Math.ceil(config.windowMs / 1000)))
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message:
            'PUCHO is getting too many requests at once. Give it a second, then try again.',
        },
      })
      return
    }
    next()
  }
}

export function resetLimits() {
  hits.clear()
}