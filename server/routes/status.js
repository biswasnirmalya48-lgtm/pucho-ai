/**
 * Capability + model status.  This is the only endpoint the client uses to
 * learn what the server can do.  It is deliberately free of credentials.
 */
import express from 'express'
import { APP_NAME, APP_VERSION, TAGLINE, GROQ, LIMITS, MODES_UI, MODE_IDS } from '../config.js'
import { resolveRuntimeModels, getAvailableModels } from '../services/models.js'
import { configuredProvider } from '../services/websearch.js'
import { isTtsAvailable } from '../services/tts.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { conversations, projects } from '../db.js'
import { logger } from '../middleware/errors.js'

const router = express.Router()

router.get('/status', rateLimit('read'), async (req, res) => {
  const configured = Boolean(GROQ.apiKey)
  let models = null
  let modelError = null
  if (configured) {
    try {
      models = await resolveRuntimeModels()
    } catch (err) {
      modelError = String(err?.code || 'unavailable')
      logger(req, 'warn', 'model discovery failed', { detail: String(err?.message || err) })
    }
  }

  res.json({
    app: { name: APP_NAME, version: APP_VERSION, tagline: TAGLINE },
    groq: {
      configured,
      apiUrl: GROQ.apiUrl,
      singleModel: GROQ.singleModel || null,
      modelError,
    },
    modes: MODES_UI.map((mode) => ({
      ...mode,
      model: models?.perMode?.[mode.id]?.id ?? null,
      vision: models?.perMode?.[mode.id]?.vision ?? false,
      reasoning: models?.perMode?.[mode.id]?.reasoning ?? false,
    })),
    vision: {
      available: Boolean(models?.visionCandidate),
      model: models?.visionCandidate ?? null,
    },
    webSearch: {
      available: Boolean(configuredProvider()),
      provider: configuredProvider(),
    },
    tts: { available: isTtsAvailable() },
    counts: {
      conversations: conversations.count(),
      projects: projects.list().length,
    },
    limits: {
      fileBytes: LIMITS.fileBytes,
      imageBytes: LIMITS.imageBytes,
      messageChars: LIMITS.messageChars,
      filesPerMessage: LIMITS.filesPerMessage,
    },
    modeIds: MODE_IDS,
  })
})

/** Models the configured key can actually reach (empty list when unconfigured). */
router.get('/models', rateLimit('read'), async (req, res) => {
  if (!GROQ.apiKey) {
    return res.status(200).json({ models: [], configured: false })
  }
  try {
    const { models, error, stale } = await getAvailableModels({ force: req.query.force === '1' })
    return res.json({ models, configured: true, error: error ?? null, stale: !!stale })
  } catch (err) {
    logger(req, 'warn', 'model listing failed', { detail: String(err?.message || err) })
    return res.status(502).json({
      models: [],
      configured: true,
      error: { code: err?.code || 'unavailable', message: 'PUCHO could not reach GROQ to list models.' },
    })
  }
})

export default router