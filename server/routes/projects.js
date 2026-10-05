/** Projects: a workspace that carries context, instructions and files across chats. */
import express from 'express'
import { projects, conversations, files, LIMITS } from '../db.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requireId, requireString, ValidationError } from '../lib/validate.js'

const router = express.Router()

router.get('/', rateLimit('read'), async (req, res) => {
  res.json({ projects: await projects.list() })
})

router.post('/', rateLimit('write'), async (req, res) => {
  const name = requireString(req.body?.name, { field: 'name', max: 80 })
  if ((await projects.list()).length >= LIMITS.projects) {
    throw new ValidationError('You have reached the maximum number of projects.', { status: 409 })
  }
  const project = await projects.create({
    name,
    description: requireString(req.body?.description ?? '', { field: 'description', max: 400 }),
    instructions: requireString(req.body?.instructions ?? '', { field: 'instructions', max: 8000 }),
    context: requireString(req.body?.context ?? '', { field: 'context', max: 20_000 }),
    accent: requireString(req.body?.accent ?? 'violet', { field: 'accent', max: 24 }),
  })
  res.status(201).json({ project })
})

router.get('/:id', rateLimit('read'), async (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  const project = await projects.get(id)
  if (!project) throw new ValidationError('That project no longer exists.', { code: 'not_found', status: 404 })
  res.json({
    project,
    conversations: await conversations.list({ projectId: id, limit: 200 }),
    files: await files.list({ projectId: id, limit: 200 }),
  })
})

router.patch('/:id', rateLimit('write'), async (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  if (!(await projects.get(id))) throw new ValidationError('That project no longer exists.', { code: 'not_found', status: 404 })
  const patch = {}
  if (req.body?.name !== undefined) patch.name = requireString(req.body.name, { field: 'name', max: 80 })
  if (req.body?.description !== undefined)
    patch.description = requireString(req.body.description, { field: 'description', max: 400 })
  if (req.body?.instructions !== undefined)
    patch.instructions = requireString(req.body.instructions, { field: 'instructions', max: 8000 })
  if (req.body?.context !== undefined) patch.context = requireString(req.body.context, { field: 'context', max: 20_000 })
  if (req.body?.accent !== undefined) patch.accent = requireString(req.body.accent, { field: 'accent', max: 24 })
  res.json({ project: await projects.update(id, patch) })
})

router.delete('/:id', rateLimit('write'), async (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  if (!(await projects.get(id))) throw new ValidationError('That project no longer exists.', { code: 'not_found', status: 404 })
  await projects.remove(id)
  res.json({ ok: true, id })
})

export default router