import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = 'data-test-db'

process.env.DATA_DIR = DATA_DIR
process.env.GROQ_API_KEY = ''

const db = await import('../server/db.js')
const { conversations, messages, projects, files, settings } = db

before(() => {
  fs.rmSync(path.resolve(DATA_DIR), { recursive: true, force: true })
})

after(() => {
  fs.rmSync(path.resolve(DATA_DIR), { recursive: true, force: true })
})

test('conversations can be created, listed, renamed and deleted', () => {
  const created = conversations.create({ mode: 'fast' })
  assert.match(created.id, /^[0-9a-f-]{36}$/)
  assert.equal(created.title, '')
  assert.equal(created.archived, false)

  conversations.update(created.id, { title: 'Quantum Tunneling Explained' })
  const list = conversations.list({})
  assert.equal(list.length, 1)
  assert.equal(list[0].title, 'Quantum Tunneling Explained')
  assert.equal(list[0].messageCount, 0)

  assert.ok(conversations.remove(created.id))
  assert.equal(conversations.get(created.id), null)
  assert.equal(conversations.list({}).length, 0)
})

test('messages persist in order and cascade on delete', () => {
  const conversation = conversations.create({})
  const user = messages.add({ conversationId: conversation.id, role: 'user', content: 'How does tunneling work?' })
  const assistant = messages.add({
    conversationId: conversation.id,
    role: 'assistant',
    content: 'It is a quantum effect…',
    sources: [{ title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Quantum_tunnelling', snippet: '', source: 'en.wikipedia.org' }],
  })

  const rows = messages.listByConversation(conversation.id)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].id, user.id)
  assert.equal(rows[1].sources.length, 1)

  conversations.remove(conversation.id)
  assert.equal(messages.listByConversation(conversation.id).length, 0)
  assert.ok(assistant.id)
})

test('historyFor returns only complete, non-empty turns', () => {
  const conversation = conversations.create({})
  messages.add({ conversationId: conversation.id, role: 'user', content: 'first' })
  messages.add({ conversationId: conversation.id, role: 'assistant', content: 'second' })
  messages.add({ conversationId: conversation.id, role: 'assistant', content: '', status: 'streaming' })
  messages.add({ conversationId: conversation.id, role: 'assistant', content: 'third' })

  const history = messages.historyFor(conversation.id)
  assert.deepEqual(
    history.map((h) => h.content),
    ['first', 'second', 'third'],
  )
})

test('removeFrom deletes a turn and everything after it', () => {
  const conversation = conversations.create({})
  const first = messages.add({ conversationId: conversation.id, role: 'user', content: 'one' })
  messages.add({ conversationId: conversation.id, role: 'assistant', content: 'two' })
  messages.add({ conversationId: conversation.id, role: 'user', content: 'three' })

  messages.removeFrom(first.id)
  const rows = messages.listByConversation(conversation.id)
  assert.equal(rows.length, 0)
})

test('archiving keeps a conversation out of the default list', () => {
  const before = conversations.list({}).length
  const conversation = conversations.create({})
  conversations.update(conversation.id, { archived: true })
  assert.equal(conversations.list({}).length, before)
  assert.ok(conversations.list({ archived: true }).some((c) => c.id === conversation.id))
  conversations.update(conversation.id, { archived: false })
  assert.equal(conversations.list({}).length, before + 1)
})

test('deleting a conversation removes its stored files from disk', () => {
  const conversation = conversations.create({})
  const stored = path.resolve(DATA_DIR, 'uploads', 'sample.txt')
  fs.mkdirSync(path.dirname(stored), { recursive: true })
  fs.writeFileSync(stored, 'hello')

  const row = files.create({
    name: 'sample.txt',
    size: 5,
    mime: 'text/plain',
    kind: 'text',
    stored_path: stored,
    text: 'hello',
    conversationId: conversation.id,
  })

  assert.ok(fs.existsSync(stored))
  conversations.remove(conversation.id)
  assert.equal(fs.existsSync(stored), false)
  assert.equal(files.get(row.id), null)
})

test('projects carry context and detach cleanly when deleted', () => {
  const project = projects.create({ name: 'VOCON', instructions: 'British English', context: 'Zigbee remote' })
  assert.equal(project.name, 'VOCON')
  assert.equal(projects.list().length, 1)

  const conversation = conversations.create({ projectId: project.id })
  assert.equal(conversation.projectId, project.id)

  projects.remove(project.id)
  assert.equal(projects.get(project.id), null)
  assert.equal(conversations.get(conversation.id).projectId, null)
})

test('settings merge with defaults and ignore unknown keys', () => {
  const initial = settings.getAll()
  assert.equal(initial.language, 'english')
  assert.equal(initial.theme, 'dark')

  settings.set({ language: 'hinglish', theme: 'light', hackerMode: 'on' })
  const updated = settings.getAll()
  assert.equal(updated.language, 'hinglish')
  assert.equal(updated.theme, 'light')
  assert.equal(updated.hackerMode, undefined)

  settings.reset()
  assert.equal(settings.getAll().language, 'english')
})