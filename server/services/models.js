/**
 * Model resolution for every PUCHO mode.
 *
 * Priority per mode:
 *   1. Explicit per-mode env var (GROQ_MODEL_FAST, ...)
 *   2. A single shared model (GROQ_MODEL) — "one model for everything"
 *   3. A sensible built-in default that the key can actually reach
 *   4. The first model GROQ reports for this key
 */
import { GROQ, GROQ_DEFAULTS, MODE_IDS, DEFAULT_MODE, isVisionModel, isReasoningModel } from '../config.js'
import { listModels } from './groq.js'

const CACHE_TTL_MS = 5 * 60 * 1000
let cache = { at: 0, models: [], ids: [] }

/** Models the configured key can reach, with a short cache + stale fallback. */
export async function getAvailableModels({ force = false, signal } = {}) {
  if (!GROQ.apiKey) return { ids: [], models: [], error: 'not_configured' }
  if (!force && cache.ids.length && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ids: cache.ids, models: cache.models }
  }
  try {
    const models = await listModels({ signal })
    cache = { at: Date.now(), models, ids: models.map((m) => m.id) }
    return { ids: cache.ids, models }
  } catch (err) {
    if (cache.ids.length) return { ids: cache.ids, models: cache.models, stale: true }
    return { ids: [], models: [], error: err.code || 'unavailable' }
  }
}

/** Synchronous best guess, used when we must not await a network call. */
export function modelForModeSync(mode) {
  return GROQ.models[mode] || GROQ.singleModel || GROQ_DEFAULTS[mode] || GROQ_DEFAULTS.lastResort
}

export function normalizeMode(mode) {
  return MODE_IDS.includes(mode) ? mode : DEFAULT_MODE
}

/**
 * Resolved runtime configuration: one model per mode plus a vision model.
 * Safe to serialise to the client — contains no credentials.
 */
export async function resolveRuntimeModels({ signal } = {}) {
  const { ids, error } = await getAvailableModels({ signal })
  const pick = (mode) => {
    const configured = GROQ.models[mode] || GROQ.singleModel
    if (configured) return { id: configured, source: 'env' }
    const preferred = GROQ_DEFAULTS[mode]
    if (!ids.length || ids.includes(preferred)) return { id: preferred, source: 'default' }
    return { id: ids[0], source: 'discovered' }
  }
  const perMode = {}
  for (const mode of MODE_IDS) {
    const picked = pick(mode)
    perMode[mode] = {
      id: picked.id,
      source: picked.source,
      vision: isVisionModel(picked.id),
      reasoning: isReasoningModel(picked.id),
    }
  }
  const visionCandidate =
    GROQ.visionModel ||
    Object.values(perMode).find((m) => m.vision)?.id ||
    ids.find(isVisionModel) ||
    null
  return { perMode, visionCandidate, availableIds: ids, discoveryError: error || null }
}

/**
 * Decide which model should actually answer a request.
 * When the message carries images and no vision model is reachable we return
 * `null` for the model so the caller can explain the limitation honestly.
 */
export async function resolveModelForRequest({ mode, hasImages, signal } = {}) {
  const runtime = await resolveRuntimeModels({ signal })
  const chosen = runtime.perMode[normalizeMode(mode)] || runtime.perMode[DEFAULT_MODE]
  if (!hasImages) return { ...chosen, runtime }
  if (chosen.vision) return { ...chosen, usedVision: true, runtime }
  if (runtime.visionCandidate) {
    const vision = runtime.perMode[normalizeMode(mode)]
    return {
      id: runtime.visionCandidate,
      source: GROQ.visionModel ? 'env-vision' : 'vision-capable',
      vision: true,
      reasoning: isReasoningModel(runtime.visionCandidate),
      usedVision: true,
      modeModel: chosen.id,
      runtime,
    }
  }
  return { ...chosen, visionBlocked: true, runtime }
}