import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  sanitizeText,
  requireString,
  requireId,
  requireOneOf,
  requireInt,
  validateChatBody,
  ValidationError,
} from '../server/lib/validate.js'

test('sanitizeText strips control characters but keeps newlines', () => {
  assert.equal(sanitizeText('a\u0000b\u001fc\nd\te'), 'abc\nd\te')
  assert.equal(sanitizeText('line1\r\nline2'), 'line1\nline2')
})

test('requireString trims and enforces length', () => {
  assert.equal(requireString('  hello  ', { field: 'content' }), 'hello')
  assert.equal(requireString('abcdef', { field: 'content', max: 3 }), 'abc')
  assert.throws(() => requireString(42, { field: 'content' }), ValidationError)
  assert.throws(() => requireString('', { field: 'content', min: 1 }), ValidationError)
})

test('requireId only accepts safe identifiers', () => {
  assert.equal(requireId('0f8fad5b-9c1e'), '0f8fad5b-9c1e')
  assert.throws(() => requireId('../../etc/passwd'), ValidationError)
  assert.throws(() => requireId('short'), ValidationError)
})

test('requireOneOf rejects unknown values', () => {
  assert.equal(requireOneOf('fast', ['fast', 'code']), 'fast')
  assert.equal(requireOneOf(undefined, ['fast'], { fallback: 'fast' }), 'fast')
  assert.throws(() => requireOneOf('nope', ['fast', 'code']), ValidationError)
})

test('requireInt clamps to range and falls back on noise', () => {
  assert.equal(requireInt('5', { min: 1, max: 10 }), 5)
  assert.equal(requireInt('99', { min: 1, max: 10 }), 10)
  assert.equal(requireInt('nope', { fallback: 3 }), 3)
  assert.equal(requireInt('', { fallback: 3 }), 3)
  assert.throws(() => requireInt('abc'), ValidationError)
})

test('validateChatBody defaults to a send action', () => {
  const parsed = validateChatBody({ content: '  Hello PUCHO ' })
  assert.equal(parsed.action, 'send')
  assert.equal(parsed.content, 'Hello PUCHO')
  assert.deepEqual(parsed.attachmentIds, [])
  assert.equal(parsed.useSearch, true)
})

test('validateChatBody accepts an attachment-only send', () => {
  const parsed = validateChatBody({ content: '   ', attachmentIds: ['0f8fad5b-9c1e'] })
  assert.match(parsed.content, /attached file/i)
})

test('validateChatBody rejects empty messages', () => {
  assert.throws(() => validateChatBody({ content: '  ' }), ValidationError)
  assert.throws(() => validateChatBody({}), ValidationError)
})

test('validateChatBody requires a messageId for regenerate/continue', () => {
  assert.throws(() => validateChatBody({ action: 'regenerate', conversationId: '0f8fad5b-9c1e' }), ValidationError)
  const parsed = validateChatBody({
    action: 'continue',
    conversationId: '0f8fad5b-9c1e',
    messageId: '1a2b3c4d-5e6f',
  })
  assert.equal(parsed.action, 'continue')
})

test('validateChatBody caps message length', () => {
  const parsed = validateChatBody({ content: 'x'.repeat(50_000) })
  assert.equal(parsed.content.length, 32_000)
})