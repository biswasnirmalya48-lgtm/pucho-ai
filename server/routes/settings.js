/** Personalisation settings: theme, language, response style, default mode, voice. */
import express from 'express'
import { settings, DEFAULT_SETTINGS } from '../db.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requireOneOf, requireBool, requireInt, ValidationError } from '../lib/validate.js'
import { MODE_IDS } from '../config.js'

const router = express.Router()

const LANGUAGES = ['english', 'hindi', 'bengali', 'hinglish']
const STYLES = ['simple', 'balanced', 'detailed']
const THEMES = ['dark', 'light', 'system']

function validatePatch(body = {}) {
  const patch = {}
  if (body.name !== undefined) patch.name = String(body.name).slice(0, 60)
  if (body.language !== undefined)
    patch.language = requireOneOf(body.language, LANGUAGES, { field: 'language' })
  if (body.responseStyle !== undefined)
    patch.responseStyle = requireOneOf(body.responseStyle, STYLES, { field: 'responseStyle' })
  if (body.theme !== undefined) patch.theme = requireOneOf(body.theme, THEMES, { field: 'theme' })
  if (body.defaultMode !== undefined)
    patch.defaultMode = requireOneOf(body.defaultMode, MODE_IDS, { field: 'defaultMode' })
  if (body.autoTitle !== undefined) patch.autoTitle = requireBool(body.autoTitle)
  if (body.sendOnEnter !== undefined) patch.sendOnEnter = requireBool(body.sendOnEnter)
  if (body.voiceInput !== undefined) patch.voiceInput = requireBool(body.voiceInput)
  if (body.readAloud !== undefined) patch.readAloud = requireBool(body.readAloud)
  if (body.speakRate !== undefined) {
    const rate = Number(body.speakRate)
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) {
      throw new ValidationError('Speech rate must be between 0.5 and 2.', { field: 'speakRate' })
    }
    patch.speakRate = Math.round(rate * 100) / 100
  }
  if (body.reducedMotion !== undefined) patch.reducedMotion = requireBool(body.reducedMotion)
  if (body.speechEnabled !== undefined) patch.speechEnabled = requireBool(body.speechEnabled)
  return patch
}

router.get('/', rateLimit('read'), async (req, res) => {
  res.json({ settings: await settings.getAll(), defaults: DEFAULT_SETTINGS })
})

router.patch('/', rateLimit('write'), async (req, res) => {
  const patch = validatePatch(req.body)
  if (!Object.keys(patch).length) return res.json({ settings: await settings.getAll() })
  return res.json({ settings: await settings.set(patch) })
})

router.post('/reset', rateLimit('write'), async (req, res) => {
  res.json({ settings: await settings.reset() })
})

export default router