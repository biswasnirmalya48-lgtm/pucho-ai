import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.DATA_DIR = 'data-test-ratelimit'
process.env.GROQ_API_KEY = ''

const { rateLimit, resetLimits } = await import('../server/middleware/rateLimit.js')

/** Minimal express-like req/res pair. */
function fakeExchange() {
  const headers = {}
  const req = { headers: {}, socket: { remoteAddress: '203.0.113.7' }, ip: '203.0.113.7' }
  const res = {
    statusCode: 200,
    body: null,
    setHeader(key, value) {
      headers[key.toLowerCase()] = value
    },
    status(code) {
      res.statusCode = code
      return res
    },
    json(payload) {
      res.body = payload
      return res
    },
  }
  return { req, res, headers }
}

test('requests under the limit pass through with headers', () => {
  resetLimits()
  const middleware = rateLimit('search')
  const { req, res, headers } = fakeExchange()
  let called = false
  middleware(req, res, () => {
    called = true
  })
  assert.equal(called, true)
  assert.equal(res.statusCode, 200)
  assert.equal(Number(headers['x-ratelimit-limit']), 120)
  assert.equal(Number(headers['x-ratelimit-remaining']), 119)
})

test('bursting past the limit returns a friendly 429', () => {
  resetLimits()
  const middleware = rateLimit('search')
  let limited = null
  for (let i = 0; i < 121; i += 1) {
    const { req, res } = fakeExchange()
    middleware(req, res, () => {})
    if (res.statusCode === 429) {
      limited = res
      break
    }
  }
  assert.ok(limited, 'rate limit never triggered')
  assert.equal(limited.body.error.code, 'rate_limited')
  assert.match(limited.body.error.message, /too many requests/i)
  assert.ok(!/gsk_|key|secret/i.test(limited.body.error.message))
})

test('different clients have separate buckets', () => {
  resetLimits()
  const middleware = rateLimit('search')
  for (let i = 0; i < 121; i += 1) {
    const { req, res } = fakeExchange()
    middleware(req, res, () => {})
  }
  const other = fakeExchange()
  other.req.socket.remoteAddress = '198.51.100.9'
  let called = false
  middleware(other.req, other.res, () => {
    called = true
  })
  assert.equal(called, true, 'a second client should not inherit the first client’s bucket')
})