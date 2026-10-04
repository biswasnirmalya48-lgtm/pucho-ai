/** Optional server-side text-to-speech.  Returns a clear 501 when unconfigured. */
import express from 'express'
import { synthesize, isTtsAvailable } from '../services/tts.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requireString, sanitizeText } from '../lib/validate.js'

const router = express.Router()

router.post('/tts', rateLimit('write'), async (req, res) => {
  if (!isTtsAvailable()) {
    return res.status(501).json({
      error: {
        code: 'tts_unavailable',
        message:
          'Server-side speech is not configured. PUCHO will read answers aloud with your browser voice instead.',
      },
    })
  }
  const text = sanitizeText(requireString(req.body?.text, { field: 'text', max: 4000 }))
  const voice = req.body?.voice ? sanitizeText(String(req.body.voice)).slice(0, 64) : undefined
  const result = await synthesize({ text, voice })
  if (result.status !== 'ok') {
    return res.status(502).json({
      error: {
        code: 'tts_failed',
        message:
          result.status === 'unavailable'
            ? 'Server-side speech is not configured. PUCHO will use your browser voice instead.'
            : "PUCHO couldn't generate audio right now. It will fall back to your browser voice.",
      },
    })
  }
  res.setHeader('Content-Type', result.mime)
  res.setHeader('Cache-Control', 'no-store')
  return res.send(result.audio)
})

router.get('/tts/status', rateLimit('read'), (req, res) => {
  res.json({ available: isTtsAvailable() })
})

export default router