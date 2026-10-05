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

test('conversations can be created, listed, renamed and deleted', async () => {
  const created = await conversations.create({ mode: 'fast' })
  assert.match(created.id, /^[0-9a-f-]{36}$/)
  assert.equal(created.title, '')
  assert.equal(created.archived, false)

  await conversations.update(created.id, { title: 'Quantum Tunneling Explained' })
  const list = await conversations.list({})
  assert.equal(list.length, 1)
  assert.equal(list[0].title, 'Quantum Tunneling Explained')
  assert.equal(list[0].messageCount, 0)

  await conversations.remove(created.id)
  assert.equal(await conversations.get(created.id), null)
  assert.equal((await conversations.list({})).length, 0)
})

test('messages persist in order and cascade on delete', async () => {
  const conversation = await conversations.create({})
  const user = await messages.add({
    conversationId: conversation.id,
    role: 'user',
    content: 'How does tunneling work?',
  })
  const assistant = await messages.add({
    conversationId: conversation.id,
    role: 'assistant',
    content: 'It is a quantum effect…',
    sources: [
      {
        title: 'Wikipedia',
        url: 'https://en.wikipedia.org/wiki/Quantum_tunnelling',
        snippet: '',
        source: 'en.wikipedia.org',
      },
    ],
  })

  const rows = await messages.listByConversation(conversation.id)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].id, user.id)
  assert.equal(rows[1].sources.length, 1)

  await conversations.remove(conversation.id)
  assert.equal((await messages.listByConversation(conversation.id)).length, 0)
  assert.ok(assistant.id)
})

test('historyFor returns only complete, non-empty turns', async () => {
  const conversation = await conversations.create({})
  await messages.add({ conversationId: conversation.id, role: 'user', content: 'first' })
  await messages.add({ conversationId: conversation.id, role: 'assistant', content: 'second' })
  await messages.add({
    conversationId: conversation.id,
    role: 'assistant',
    content: '',
    status: 'streaming',
  })
  await messages.add({ conversationId: conversation.id, role: 'assistant', content: 'third' })

  const history = await messages.historyFor(conversation.id)
  assert.deepEqual(
    history.map((h) => h.content),
    ['first', 'second', 'third'],
  )
})

test('removeFrom deletes a turn and everything after it', async () => {
  const conversation = await conversations.create({})
  const first = await messages.add({ conversationId: conversation.id, role: 'user', content: 'one' })
  await messages.add({ conversationId: conversation.id, role: 'assistant', content: 'two' })
  await messages.add({ conversationId: conversation.id, role: 'user', content: 'three' })

  await messages.removeFrom(first.id)
  const rows = await messages.listByConversation(conversation.id)
  assert.equal(rows.length, 0)
})

test('archiving keeps a conversation out of the default list', async () => {
  const before = (await conversations.list({})).length
  const conversation = await conversations.create({})
  await conversations.update(conversation.id, { archived: true })
  assert.equal((await conversations.list({})).length, before)
  assert.ok((await conversations.list({ archived: true })).some((c) => c.id === conversation.id))
  await conversations.update(conversation.id, { archived: false })
  assert.equal((await conversations.list({})).length, before + 1)
})

test('deleting a conversation removes its stored files from disk', async () => {
  const conversation = await conversations.create({})
  const stored = path.resolve(DATA_DIR, 'uploads', 'sample.txt')
  fs.mkdirSync(path.dirname(stored), { recursive: true })
  fs.writeFileSync(stored, 'hello')

  const row = await files.create({
    name: 'sample.txt',
    size: 5,
    mime: 'text/plain',
    kind: 'text',
    stored_path: stored,
    text: 'hello',
    conversationId: conversation.id,
  })

  assert.ok(fs.existsSync(stored))
  await conversations.remove(conversation.id)
  assert.equal(fs.existsSync(stored), false)
  assert.equal(await files.get(row.id), null)
})

test('projects carry context and detach cleanly when deleted', async () => {
  const project = await projects.create({
    name: 'VOCON',
    instructions: 'British English',
    context: 'Zigbee remote',
  })
  assert.equal(project.name, 'VOCON')
  assert.equal((await projects.list()).length, 1)

  const conversation = await conversations.create({ projectId: project.id })
  assert.equal(conversation.projectId, project.id)

  await projects.remove(project.id)
  assert.equal(await projects.get(project.id), null)
  assert.equal((await conversations.get(conversation.id)).projectId, null)
})

test('settings merge with defaults and ignore unknown keys', async () => {
  const initial = await settings.getAll()
  assert.equal(initial.language, 'english')
  assert.equal(initial.theme, 'dark')

  await settings.set({ language: 'hinglish', theme: 'light', hackerMode: 'on' })
  const updated = await settings.getAll()
  assert.equal(updated.language, 'hinglish')
  assert.equal(updated.theme, 'light')
  assert.equal(updated.hackerMode, undefined)

  await settings.reset()
  assert.equal((await settings.getAll()).language, 'english')
})

test('counts and JSON payloads stay serialisable', async () => {
  const conversation = await conversations.create({ title: 'Serialisable' })
  const count = await conversations.count()
  assert.equal(typeof count, 'number')
  // Guards against libSQL returning `bigint` for aggregates, which would
  // make JSON.stringify throw on the production driver.
  assert.doesNotThrow(() => JSON.stringify({ count, conversation }))
})