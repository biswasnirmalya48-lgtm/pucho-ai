/**
 * Conversations: list, search, read (with paginated messages), rename,
 * archive, move between projects, pin and delete.
 */
import express from 'express'
import {
  conversations,
  messages,
  files,
  projects,
  newId,
  searchConversations,
} from '../db.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requireString, requireId, optionalId, requireOneOf, sanitizeText, ValidationError } from '../lib/validate.js'
import { MODE_IDS, LIMITS } from '../config.js'

const router = express.Router()

const snippetFor = (content, query) => {
  const text = String(content || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (!query) return text.slice(0, 160)
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  const start = Math.max(0, index - 60)
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 200)}${text.length > start + 200 ? '…' : ''}`
}

/** Search titles, user messages and PUCHO answers. */
router.get('/search', rateLimit('search'), async (req, res) => {
  const query = requireString(req.query.q ?? '', { field: 'q', max: 200 }).trim()
  if (query.length < 2) return res.json({ results: [], query })
  const rows = await searchConversations(query)

  const byConversation = new Map()
  const needle = query.toLowerCase()
  for (const row of rows) {
    const titleMatch = (row.title || '').toLowerCase().includes(needle)
    const entry = byConversation.get(row.id) || {
      id: row.id,
      title: row.title || 'Untitled chat',
      updatedAt: row.updated_at,
      archived: !!row.archived,
      projectId: row.project_id,
      titleMatch,
      best: null,
    }
    const content = row.content || ''
    // Only messages that actually contain the query may win. Without this a
    // short, unrelated question in the same chat could displace a matching
    // answer on the "prefer the shorter snippet" tie-break.
    if (content.trim() && content.toLowerCase().includes(needle)) {
      const rank = (row.role === 'user' ? 1 : 0) + (entry.titleMatch ? 1 : 0)
      if (!entry.best || rank > entry.best.rank || content.length < entry.best.length) {
        entry.best = { rank, role: row.role, length: content.length }
        entry.snippet = snippetFor(content, entry.titleMatch ? '' : query)
        entry.matchedIn = row.role === 'user' ? 'question' : 'answer'
      }
    }
    byConversation.set(row.id, entry)
  }

  const results = [...byConversation.values()]
    .filter((entry) => entry.titleMatch || entry.snippet)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 60)
    .map(({ best, ...rest }) => rest)

  return res.json({ results, query })
})

router.get('/', rateLimit('read'), async (req, res) => {
  const query = requireString(req.query.q ?? '', { field: 'q', max: 200 }).trim()
  const archived = req.query.archived === '1' || req.query.archived === 'true'
  const projectId = optionalId(req.query.projectId, { field: 'projectId' })
  const limit = Math.min(500, Number.parseInt(req.query.limit ?? '300', 10) || 300)
  const offset = Math.max(0, Number.parseInt(req.query.offset ?? '0', 10) || 0)
  const items = await conversations.list({ query, archived, projectId, limit, offset })
  return res.json({ conversations: items, total: await conversations.count({ archived }) })
})

/** Bulk operations live before /:id so "clear all" is not read as an id. */
router.post('/bulk', rateLimit('write'), async (req, res) => {
  const op = requireOneOf(req.body?.op, ['archive_all', 'delete_all', 'delete'], { field: 'op' })
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id) => requireId(id, { field: 'ids' })) : []
  const targets = ids.length ? ids : (await conversations.list({ limit: 500 })).map((c) => c.id)
  let deleted = 0
  for (const id of targets) {
    if (!(await conversations.exists(id))) continue
    if (op === 'delete' || op === 'delete_all') {
      await conversations.remove(id)
      deleted += 1
    } else {
      await conversations.update(id, { archived: true })
    }
  }
  return res.json({ ok: true, op, count: targets.length, deleted })
})

router.get('/:id', rateLimit('read'), async (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  const conversation = await conversations.get(id)
  if (!conversation) throw new ValidationError('That conversation no longer exists.', { code: 'not_found', status: 404 })
  const limit = Math.min(500, Number.parseInt(req.query.limit ?? '200', 10) || 200)
  const before = req.query.before !== undefined ? Number.parseInt(req.query.before, 10) : null
  const rows = await messages.listByConversation(id, { limit, before: Number.isFinite(before) ? before : null })
  return res.json({
    conversation,
    messages: rows,
    hasMore: rows.length > 0 && rows[0].position > 0,
    files: await files.list({ conversationId: id, limit: 100 }),
  })
})

router.get('/:id/messages', rateLimit('read'), async (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  if (!(await conversations.exists(id))) throw new ValidationError('That conversation no longer exists.', { code: 'not_found', status: 404 })
  const limit = Math.min(200, Number.parseInt(req.query.limit ?? '50', 10) || 50)
  const before = Number.parseInt(req.query.before, 10)
  const rows = await messages.listByConversation(id, {
    limit: limit + 1,
    before: Number.isFinite(before) ? before : null,
  })
  const hasMore = rows.length > limit
  return res.json({ messages: hasMore ? rows.slice(0, limit) : rows, hasMore })
})

router.patch('/:id', rateLimit('write'), async (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  const conversation = await conversations.get(id)
  if (!conversation) throw new ValidationError('That conversation no longer exists.', { code: 'not_found', status: 404 })

  const patch = {}
  if (req.body?.title !== undefined) {
    const title = sanitizeText(requireString(req.body.title, { field: 'title', max: LIMITS.conversationTitle }))
    patch.title = title || 'Untitled chat'
  }
  if (req.body?.mode !== undefined) patch.mode = requireOneOf(req.body.mode, MODE_IDS, { field: 'mode' })
  if (req.body?.archived !== undefined) patch.archived = !!req.body.archived
  if (req.body?.pinned !== undefined) patch.pinned = !!req.body.pinned
  if (req.body?.projectId !== undefined) {
    const projectId = optionalId(req.body.projectId, { field: 'projectId' })
    if (projectId && !(await projects.get(projectId))) {
      throw new ValidationError('That project no longer exists.', { code: 'not_found', status: 404 })
    }
    patch.projectId = projectId
  }
  return res.json({ conversation: await conversations.update(id, patch) })
})

router.delete('/:id', rateLimit('write'), async (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  const conversation = await conversations.get(id)
  if (!conversation) throw new ValidationError('That conversation no longer exists.', { code: 'not_found', status: 404 })
  await conversations.remove(id)
  return res.json({ ok: true, id, deletedTitle: conversation.title })
})

export default router