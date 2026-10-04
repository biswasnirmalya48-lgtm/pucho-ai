import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildSystemPrompt, buildMessages } from '../server/services/prompt.js'
import { heuristicTitle } from '../server/services/titling.js'

test('system prompt includes the base identity and the selected mode', () => {
  const prompt = buildSystemPrompt({ mode: 'code', responseStyle: 'simple', language: 'english' })
  assert.match(prompt, /PUCHO/)
  assert.match(prompt, /Current mode: Code/)
  assert.match(prompt, /SIMPLE/)
})

test('language instructions follow the user setting', () => {
  const hindi = buildSystemPrompt({ language: 'hindi' })
  assert.match(hindi, /हिंदी/)
  const bengali = buildSystemPrompt({ language: 'bengali' })
  assert.match(bengali, /বাংলা/)
  const hinglish = buildSystemPrompt({ language: 'hinglish' })
  assert.match(hinglish, /Hinglish/)
  assert.doesNotMatch(hinglish, /देवनागरी/)
})

test('project context is injected as reference data, not as instructions', () => {
  const prompt = buildSystemPrompt({
    mode: 'fast',
    project: {
      name: 'VOCON',
      instructions: 'Answer in British English.',
      context: 'The v2 remote uses Zigbee.',
    },
  })
  assert.match(prompt, /VOCON/)
  assert.match(prompt, /REFERENCE DATA/)
  assert.match(prompt, /Zigbee/)
})

test('uploaded file text is injected and unparseable files are called out', () => {
  const prompt = buildSystemPrompt({
    mode: 'fast',
    files: [
      { name: 'report.pdf', kind: 'pdf', size: 2048, text: 'Quarterly revenue grew.', truncated: false },
      { name: 'scan.pdf', kind: 'pdf', size: 900, text: '', warning: 'No text could be extracted.' },
    ],
  })
  assert.match(prompt, /Quarterly revenue grew/)
  assert.match(prompt, /could NOT be extracted/)
  assert.match(prompt, /Never claim to have read its contents/)
})

test('research mode states when web search is unavailable', () => {
  const prompt = buildSystemPrompt({ mode: 'research', web: { status: 'unavailable', results: [] } })
  assert.match(prompt, /Live web search is NOT available/)
})

test('real search results are passed through with citation numbers', () => {
  const prompt = buildSystemPrompt({
    mode: 'research',
    web: {
      status: 'ok',
      results: [
        { title: 'SQLite docs', url: 'https://sqlite.org/docs.html', snippet: 'About SQLite' },
        { title: 'Postgres docs', url: 'https://www.postgresql.org/docs/', snippet: 'About Postgres' },
      ],
    },
  })
  assert.match(prompt, /\[1\] SQLite docs/)
  assert.match(prompt, /\[2\] Postgres docs/)
  assert.match(prompt, /https:\/\/sqlite.org\/docs.html/)
})

test('vision wording changes when images can and cannot be read', () => {
  const canSee = buildSystemPrompt({ mode: 'fast', hasImages: true, vision: true })
  assert.match(canSee, /attached image\(s\)/)
  const cannotSee = buildSystemPrompt({ mode: 'fast', hasImages: true, vision: false })
  assert.match(cannotSee, /cannot see images/)
})

test('buildMessages keeps history then the new prompt', () => {
  const messages = buildMessages({
    system: 'sys',
    history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }],
    prompt: 'what next?',
  })
  assert.equal(messages.length, 4)
  assert.equal(messages[0].role, 'system')
  assert.equal(messages[3].content, 'what next?')
})

test('buildMessages attaches images as structured parts', () => {
  const messages = buildMessages({
    system: 'sys',
    history: [],
    prompt: 'what is this?',
    images: [{ dataUrl: 'data:image/png;base64,AAAA' }],
  })
  const last = messages[messages.length - 1]
  assert.equal(Array.isArray(last.content), true)
  assert.equal(last.content[0].type, 'image_url')
  assert.equal(last.content[1].text, 'what is this?')
})

test('heuristic titles are short, readable and never empty', () => {
  assert.equal(heuristicTitle('How does quantum tunneling work?'), 'Quantum tunneling work')
  assert.equal(heuristicTitle('hi'), 'New Chat')
  assert.equal(
    heuristicTitle('Please write a detailed explanation of the CAP theorem'),
    'Detailed explanation of the CAP theorem',
  )
  assert.equal(heuristicTitle(''), 'New Chat')
  assert.ok(heuristicTitle('a'.repeat(200)).length <= 120)
})