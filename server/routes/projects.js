/** Projects: a workspace that carries context, instructions and files across chats. */
import express from 'express'
import { projects, conversations, files, LIMITS } from '../db.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requireId, requireString, ValidationError } from '../lib/validate.js'

const router = express.Router()

router.get('/', rateLimit('read'), (req, res) => {
  res.json({ projects: projects.list() })
})

router.post('/', rateLimit('write'), (req, res) => {
  const name = requireString(req.body?.name, { field: 'name', max: 80 })
  if (projects.list().length >= LIMITS.projects) {
    throw new ValidationError('You have reached the maximum number of projects.', { status: 409 })
  }
  const project = projects.create({
    name,
    description: requireString(req.body?.description ?? '', { field: 'description', max: 400 }),
    instructions: requireString(req.body?.instructions ?? '', { field: 'instructions', max: 8000 }),
    context: requireString(req.body?.context ?? '', { field: 'context', max: 20_000 }),
    accent: requireString(req.body?.accent ?? 'violet', { field: 'accent', max: 24 }),
  })
  res.status(201).json({ project })
})

router.get('/:id', rateLimit('read'), (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  const project = projects.get(id)
  if (!project) throw new ValidationError('That project no longer exists.', { code: 'not_found', status: 404 })
  res.json({
    project,
    conversations: conversations.list({ projectId: id, limit: 200 }),
    files: files.list({ projectId: id, limit: 200 }),
  })
})

router.patch('/:id', rateLimit('write'), (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  if (!projects.get(id)) throw new ValidationError('That project no longer exists.', { code: 'not_found', status: 404 })
  const patch = {}
  if (req.body?.name !== undefined) patch.name = requireString(req.body.name, { field: 'name', max: 80 })
  if (req.body?.description !== undefined)
    patch.description = requireString(req.body.description, { field: 'description', max: 400 })
  if (req.body?.instructions !== undefined)
    patch.instructions = requireString(req.body.instructions, { field: 'instructions', max: 8000 })
  if (req.body?.context !== undefined) patch.context = requireString(req.body.context, { field: 'context', max: 20_000 })
  if (req.body?.accent !== undefined) patch.accent = requireString(req.body.accent, { field: 'accent', max: 24 })
  res.json({ project: projects.update(id, patch) })
})

router.delete('/:id', rateLimit('write'), (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  if (!projects.get(id)) throw new ValidationError('That project no longer exists.', { code: 'not_found', status: 404 })
  projects.remove(id)
  res.json({ ok: true, id })
})

export default router