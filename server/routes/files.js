/**
 * File uploads.
 *
 * Uploads are accepted into memory, written through the storage abstraction
 * (local disk in development, Vercel Blob on serverless) with generated
 * names, size- and type-checked, and text is extracted immediately so PUCHO
 * can genuinely read them (or state clearly when it cannot).
 */
import express from 'express'
import path from 'node:path'
import multer from 'multer'

import { LIMITS } from '../config.js'
import * as storage from '../storage.js'
import { extractText, classify, isSupported, SUPPORTED_EXTENSIONS } from '../services/extract.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { logger } from '../middleware/errors.js'
import { requireId, optionalId, ValidationError } from '../lib/validate.js'
import { files, newId } from '../db.js'

const router = express.Router()

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const DOC_MIME = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/rtf',
  'text/rtf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/json',
  'application/xml',
  'text/xml',
])

const safeName = (name) =>
  path
    .basename(String(name || 'file'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\]/g, '_')
    .slice(0, 120) || 'file'

const storageKey = (originalName) => {
  const ext = path.extname(safeName(originalName)).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12)
  return `${newId()}${ext}`
}

const upload = multer({
  // Buffers in memory: serverless filesystems are read-only, so nothing may
  // be written to disk before the storage abstraction accepts it.
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.fileBytes, files: LIMITS.filesPerMessage, fields: 10 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(safeName(file.originalname)).toLowerCase()
    const mime = String(file.mimetype || '').toLowerCase()
    if (IMAGE_MIME.has(mime) || DOC_MIME.has(mime) || SUPPORTED_EXTENSIONS.has(ext)) {
      cb(null, true)
      return
    }
    cb(
      new ValidationError(
        `PUCHO cannot read ${ext || mime || 'that file type'}. Try a PDF, DOCX, TXT, code file or image.`,
        { code: 'unsupported_file', status: 415 },
      ),
    )
  },
})

router.post('/', rateLimit('upload'), upload.array('files', LIMITS.filesPerMessage), async (req, res) => {
  const projectId = optionalId(req.body?.projectId, { field: 'projectId' })
  const conversationId = optionalId(req.body?.conversationId, { field: 'conversationId' })
  const uploaded = req.files || []
  if (!uploaded.length) throw new ValidationError('No file was uploaded.', { field: 'files' })

  const created = []
  for (const file of uploaded) {
    const name = safeName(file.originalname)
    const kind = classify(name, file.mimetype)
    const buffer = file.buffer ?? Buffer.alloc(0)

    if (!isSupported(name, file.mimetype)) {
      throw new ValidationError(`PUCHO cannot read ${name}.`, { code: 'unsupported_file', status: 415 })
    }

    const extracted = await extractText({ buffer, name, mime: file.mimetype })
    const mime = String(file.mimetype || 'application/octet-stream')
    const storedPath = await storage.put(storageKey(name), buffer, mime)
    try {
      const row = await files.create({
        name,
        size: file.size,
        mime,
        kind,
        stored_path: storedPath,
        text: extracted.text,
        truncated: extracted.truncated,
        pageCount: extracted.pageCount,
        warning: extracted.warning,
        projectId,
        conversationId,
      })
      created.push(row)
      logger(req, 'info', 'file stored', {
        name,
        kind,
        chars: extracted.text.length,
        warning: extracted.warning,
      })
    } catch (err) {
      // Don't leave an orphaned object behind if the row could not be written.
      await storage.remove(storedPath)
      throw err
    }
  }

  res.status(201).json({ files: created })
})

router.get('/', rateLimit('read'), async (req, res) => {
  const projectId = optionalId(req.query.projectId, { field: 'projectId' })
  const conversationId = optionalId(req.query.conversationId, { field: 'conversationId' })
  res.json({ files: await files.list({ projectId, conversationId, limit: 200 }) })
})

router.get('/:id', rateLimit('read'), async (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  const row = await files.get(id)
  if (!row) throw new ValidationError('That file is no longer available.', { code: 'not_found', status: 404 })
  res.json({ file: row })
})

/** Serve the stored bytes (image previews, PDF downloads). */
router.get('/:id/raw', rateLimit('read'), async (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  const row = await files.rawRow(id)
  if (!row) throw new ValidationError('That file is no longer available.', { code: 'not_found', status: 404 })
  const stored = await storage.read(row.stored_path)
  if (!stored) {
    throw new ValidationError('That file is no longer stored.', { code: 'not_found', status: 404 })
  }
  const disposition = row.kind === 'image' || row.kind === 'pdf' ? 'inline' : 'attachment'
  res.setHeader('Content-Type', row.mime || 'application/octet-stream')
  res.setHeader('Content-Length', String(stored.size))
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeName(row.name).replace(/"/g, '')}"`)
  res.end(stored.buffer)
})

/** Extracted text, for "show me what you read". */
router.get('/:id/text', rateLimit('read'), async (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  const row = await files.rawRow(id)
  if (!row) throw new ValidationError('That file is no longer available.', { code: 'not_found', status: 404 })
  const limit = Math.min(200_000, Number.parseInt(req.query.limit ?? '20000', 10) || 20_000)
  res.json({
    id,
    name: row.name,
    kind: row.kind,
    text: (row.text || '').slice(0, limit),
    truncated: !!row.truncated || (row.text || '').length > limit,
    warning: row.warning || null,
    isImage: IMAGE_MIME.has(row.mime),
  })
})

router.delete('/:id', rateLimit('write'), async (req, res) => {
  const id = requireId(req.params.id, { field: 'id' })
  const row = await files.get(id)
  if (!row) throw new ValidationError('That file is no longer available.', { code: 'not_found', status: 404 })
  await files.remove(id)
  res.json({ ok: true, id })
})

export default router