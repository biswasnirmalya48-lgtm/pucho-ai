/**
 * POST /api/chat — the PUCHO streaming engine.
 *
 * Responsibilities, in order:
 *   1. resolve (or create) the conversation and handle send/regenerate/continue/truncate
 *   2. persist the user turn and open the assistant turn
 *   3. gather real context: project instructions, file text, live search results
 *   4. pick a model for the mode (and a vision model when images are attached)
 *   5. stream GROQ deltas to the client over SSE and persist the answer
 */
import express from 'express'

import { createSse } from '../lib/sse.js'
import * as storage from '../storage.js'
import { validateChatBody, ValidationError } from '../lib/validate.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { logger } from '../middleware/errors.js'
import { conversations, messages, files, projects, settings, assertConversationLimit } from '../db.js'
import { LIMITS, MODES, SUPPORTED_IMAGE_TYPES } from '../config.js'
import { streamCompletion, UpstreamError, FRIENDLY_MESSAGES } from '../services/groq.js'
import { normalizeMode, resolveModelForRequest } from '../services/models.js'
import { buildMessages, buildSystemPrompt } from '../services/prompt.js'
import { generateTitle } from '../services/titling.js'
import { searchWeb } from '../services/websearch.js'

const router = express.Router()

/** Prior turns for the model, newest-windowed, excluding the turn sent as prompt. */
async function buildHistory(conversationId, excludeIds = []) {
  const rows = (await messages.listByConversation(conversationId, { limit: LIMITS.historyMessages + 10 }))
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
    .filter((m) => m.status !== 'error')
    .filter((m) => !excludeIds.includes(m.id))
    .slice(-LIMITS.historyMessages)

  let total = 0
  const out = []
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    total += rows[i].content.length
    if (total > LIMITS.historyChars && out.length) break
    out.unshift({ role: rows[i].role, content: rows[i].content })
  }
  return out
}

async function loadImageDataUrl(row) {
  if (!SUPPORTED_IMAGE_TYPES.has(row.mime)) return null
  if (row.size > LIMITS.imageBytes) return null
  try {
    const stored = await storage.read(row.stored_path)
    if (!stored) return null
    return `data:${row.mime};base64,${stored.buffer.toString('base64')}`
  } catch {
    return null
  }
}

/** Resolve attachment ids to raw rows, dropping any that have since vanished. */
async function loadRawRows(ids = []) {
  const rows = await Promise.all(ids.map((id) => files.rawRow(id)))
  return rows.filter(Boolean)
}

/** Inline every usable image for a vision-capable model. */
async function inlineImages(rows, { requireImageKind = false } = {}) {
  const candidates = rows.filter((f) =>
    requireImageKind
      ? f.kind === 'image' && SUPPORTED_IMAGE_TYPES.has(f.mime)
      : SUPPORTED_IMAGE_TYPES.has(f.mime),
  )
  const urls = await Promise.all(candidates.map(loadImageDataUrl))
  return urls.filter(Boolean)
}

const fileDescriptor = (row) => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  size: row.size,
  mime: row.mime,
  url: `/api/files/${row.id}/raw`,
  textUrl: `/api/files/${row.id}/text`,
  warning: row.warning || null,
  truncated: !!row.truncated,
  textChars: (row.text || '').length,
})

const VISION_BLOCKED_MESSAGE = `I can see an image was attached, but the model wired to this mode (\`{MODEL}\`) cannot read images yet.

What you can do:
- Switch to a mode that uses a vision-capable model and send the image again.
- Describe the image in a sentence or two — I can still help with the reasoning.
- Paste the relevant text, code or data and I will work with that.

I did **not** look at the image, so I will not guess what is in it.`

async function streamReply({ body, rawBody, sse, controller, req }) {
  const signal = controller.signal
  const userSettings = await settings.getAll()
  const projectProvided = Object.prototype.hasOwnProperty.call(rawBody || {}, 'projectId')

  /* ---------------------------------------------------------------- *
   * 1. Conversation + mode
   * ---------------------------------------------------------------- */
  let conversation = null
  if (body.conversationId) {
    conversation = await conversations.get(body.conversationId)
    if (!conversation) {
      throw new ValidationError('That conversation is no longer here, so this is a fresh one.', {
        code: 'not_found',
        status: 404,
      })
    }
  }
  if (body.action !== 'send' && !conversation) {
    throw new ValidationError('Open a conversation first, then try that again.', { field: 'conversationId' })
  }

  let project = conversation?.projectId ? await projects.get(conversation.projectId) : null
  if (projectProvided) {
    project = body.projectId ? await projects.get(body.projectId) : null
    if (body.projectId && !project) {
      throw new ValidationError('That project no longer exists.', { code: 'not_found', status: 404 })
    }
    if (conversation) {
      conversation = await conversations.update(conversation.id, { projectId: project?.id ?? null })
    }
  }

  const mode = normalizeMode(body.mode || conversation?.mode || userSettings.defaultMode)
  if (!conversation) {
    await assertConversationLimit()
    conversation = await conversations.create({ mode, projectId: project?.id ?? null })
  } else if (conversation.mode !== mode) {
    conversation = await conversations.update(conversation.id, { mode })
  }

  /* ---------------------------------------------------------------- *
   * 2. Turn handling
   * ---------------------------------------------------------------- */
  let prompt = ''
  let attachmentRows = []
  let images = []
  let assistantMessage = null
  let userMessage = null
  let assistantStartedAt = 0
  let replacedIds = []

  if (body.action === 'truncate') {
    const target = await messages.get(body.messageId)
    if (!target) throw new ValidationError('That message is already gone.', { code: 'not_found', status: 404 })
    if (target.conversationId !== conversation.id) {
      throw new ValidationError('That message belongs to a different conversation.', { status: 400 })
    }
    const removed = await messages.removeFrom(target.id)
    sse.send('open', { conversationId: conversation.id })
    sse.send('truncated', {
      conversationId: conversation.id,
      removedIds: removed.map((m) => m.id),
      messages: await messages.listByConversation(conversation.id, { limit: 200 }),
      conversation,
    })
    return
  }

  if (body.action === 'regenerate') {
    const target = await messages.get(body.messageId)
    if (!target) throw new ValidationError('That message is already gone.', { code: 'not_found', status: 404 })
    if (target.conversationId !== conversation.id) {
      throw new ValidationError('That message belongs to a different conversation.', { status: 400 })
    }
    const prior = (await messages.listByConversation(conversation.id, { limit: 200 }))
      .filter((m) => m.position < target.position && m.role === 'user' && m.content.trim())
      .pop()
    if (!prior) {
      throw new ValidationError('There is no question left to answer — send a new message.', { status: 400 })
    }
    replacedIds = (await messages.removeFrom(target.id)).map((m) => m.id)
    prompt = prior.content
    userMessage = prior
    attachmentRows = await loadRawRows((prior.attachments || []).map((a) => a.id))
    images = await inlineImages(attachmentRows)
  } else if (body.action === 'continue') {
    const target = await messages.get(body.messageId)
    if (!target) throw new ValidationError('That message is already gone.', { code: 'not_found', status: 404 })
    if (target.conversationId !== conversation.id) {
      throw new ValidationError('That message belongs to a different conversation.', { status: 400 })
    }
    assistantMessage = await messages.update(target.id, { status: 'streaming' })
    prompt =
      'Continue that answer from exactly where it stopped. Do not repeat what you already wrote, do not restart, and do not add a preamble.'
  } else {
    // Raw rows: the stored path is needed to inline images for vision models.
    attachmentRows = await loadRawRows(body.attachmentIds)
    images = await inlineImages(attachmentRows, { requireImageKind: true })

    userMessage = await messages.add({
      conversationId: conversation.id,
      role: 'user',
      content: body.content,
      mode,
      status: 'complete',
      attachments: attachmentRows.map(fileDescriptor),
    })
    await files.attach(
      attachmentRows.map((f) => f.id),
      { conversationId: conversation.id, messageId: userMessage.id },
    )
    prompt = body.content
  }

  const history = await buildHistory(conversation.id, [userMessage?.id].filter(Boolean))

  /* ---------------------------------------------------------------- *
   * 3. Auto title (runs alongside the stream, never blocks it)
   * ---------------------------------------------------------------- */
  if (userSettings.autoTitle && !conversation.title.trim()) {
    generateTitle({ text: prompt })
      .then(({ title }) => {
        if (!title) return
        conversations.update(conversation.id, { title }).catch(() => {})
        sse.send('title', { conversationId: conversation.id, title })
      })
      .catch(() => {})
  }

  sse.send('open', {
    conversationId: conversation.id,
    messageId: userMessage?.id ?? null,
    mode,
    projectId: project?.id ?? null,
    // Lets the client drop the answer being regenerated immediately.
    replacedIds,
  })

  /* ---------------------------------------------------------------- *
   * 4. Model selection + vision gating
   * ---------------------------------------------------------------- */
  const model = await resolveModelForRequest({ mode, hasImages: images.length > 0, signal })

  if (model.visionBlocked) {
    const notice = VISION_BLOCKED_MESSAGE.replace('{MODEL}', model.id)
    const saved = await messages.add({
      conversationId: conversation.id,
      role: 'assistant',
      content: notice,
      mode,
      status: 'notice',
      attachments: attachmentRows.filter((f) => f.kind === 'image').map(fileDescriptor),
    })
    sse.send('meta', {
      conversationId: conversation.id,
      assistantMessageId: saved.id,
      model: model.id,
      mode,
      vision: false,
      notice: true,
    })
    sse.send('delta', { text: notice })
    sse.send('done', { message: saved, conversation: await conversations.get(conversation.id) })
    return
  }

  if (!assistantMessage) {
    assistantMessage = await messages.add({
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
      mode,
      status: 'streaming',
    })
  }
  assistantStartedAt = Date.now()

  sse.send('meta', {
    conversationId: conversation.id,
    assistantMessageId: assistantMessage.id,
    model: model.id,
    mode,
    vision: !!model.usedVision,
  })

  /* ---------------------------------------------------------------- *
   * 5. Live research — real search results, or an honest "unavailable"
   * ---------------------------------------------------------------- */
  let web = null
  if (mode === 'research' && body.useSearch) {
    sse.send('search', { status: 'running' })
    web = await searchWeb(prompt, { signal })
    sse.send('search', {
      status: web.status,
      provider: web.provider,
      count: web.results.length,
      results: web.status === 'ok' ? web.results : [],
      reason: web.reason || null,
    })
  }

  /* ---------------------------------------------------------------- *
   * 6. Prompt assembly + streaming
   * ---------------------------------------------------------------- */
  const projectFiles = project ? await files.list({ projectId: project.id, limit: 40 }) : []
  const projectContext = [
    project?.context || '',
    projectFiles.length
      ? `Files in this project (not loaded yet — ask the user to attach one if you need its contents):\n${projectFiles
          .map((f) => `- ${f.name} (${f.kind}, ${f.textChars} chars extracted)`)
          .join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const system = buildSystemPrompt({
    mode,
    language: userSettings.language,
    responseStyle: userSettings.responseStyle,
    project: project ? { name: project.name, instructions: project.instructions, context: projectContext } : null,
    files: attachmentRows.map((f) => ({
      name: f.name,
      kind: f.kind,
      size: f.size,
      text: f.text,
      truncated: f.truncated,
      warning: f.warning,
    })),
    web,
    vision: !!model.usedVision,
    hasImages: images.length > 0,
  })

  const payload = buildMessages({ system, history, prompt, images })
  const modeConfig = MODES[mode] || MODES.fast

  let streamed = ''
  try {
    const result = await streamCompletion({
      messages: payload,
      model: model.id,
      temperature: modeConfig.temperature,
      maxTokens: modeConfig.maxTokens,
      signal,
      onDelta: (text) => {
        streamed += text
        sse.send('delta', { text })
      },
    })

    const saved = await messages.update(assistantMessage.id, {
      content: assistantMessage.content + result.content,
      status: 'complete',
      sources: web?.status === 'ok' ? web.results : [],
    })
    sse.send('done', {
      message: saved,
      elapsedMs: Date.now() - assistantStartedAt,
      conversation: await conversations.get(conversation.id),
    })
  } catch (err) {
    const aborted = signal.aborted || err?.code === 'aborted'
    const partial = streamed.trim()
    let saved = null
    if (partial || assistantMessage.content) {
      saved = await messages.update(assistantMessage.id, {
        content: assistantMessage.content + partial,
        status: partial ? (aborted ? 'stopped' : 'error') : assistantMessage.content ? 'complete' : 'error',
        sources: web?.status === 'ok' ? web.results : [],
      })
    } else {
      await messages.remove(assistantMessage.id)
    }

    const publicError =
      err instanceof UpstreamError
        ? { message: err.message, code: err.code, retryable: !!err.retryable }
        : { message: FRIENDLY_MESSAGES.server, code: 'internal_error', retryable: true }

    logger(req, aborted ? 'info' : 'error', aborted ? 'generation stopped by user' : publicError.message, {
      code: publicError.code,
      detail: err instanceof UpstreamError ? err.detail : String(err?.message || err),
    })

    sse.send('error', {
      ...publicError,
      aborted: !!aborted,
      partial: partial.length > 0,
      assistantMessageId: saved?.id ?? null,
      conversation: await conversations.get(conversation.id),
    })
  }
}

router.post('/', rateLimit('chat'), async (req, res, next) => {
  let body
  try {
    body = validateChatBody(req.body)
  } catch (err) {
    return next(err)
  }

  const sse = createSse(res)
  const controller = new AbortController()
  // `res` not `req`: the request stream closes as soon as its body is read,
  // which would otherwise abort every generation immediately.
  const onClose = () => controller.abort()
  res.on('close', onClose)

  try {
    await streamReply({ body, rawBody: req.body, sse, controller, req })
  } catch (err) {
    const publicError =
      err instanceof ValidationError
        ? { message: err.message, code: err.code, retryable: false }
        : {
            message: FRIENDLY_MESSAGES.server,
            code: err?.code || 'internal_error',
            retryable: true,
          }
    if (!(err instanceof ValidationError)) {
      logger(req, 'error', 'chat failed before streaming', {
        detail: String(err?.stack || err?.message || err),
      })
    }
    sse.send('error', publicError)
  } finally {
    res.off('close', onClose)
    sse.close()
  }
  return res
})

export default router