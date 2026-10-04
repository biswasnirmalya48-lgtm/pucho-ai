import { test } from 'node:test'
import assert from 'node:assert/strict'

// Blank the model env vars *before* importing: dotenv never overrides a key
// that already exists, so this isolates the "nothing configured" behaviour even
// though the repo's .env may define a model.
process.env.GROQ_API_KEY = ''
process.env.GROQ_MODEL = ''
process.env.GROQ_MODEL_FAST = ''
process.env.GROQ_MODEL_THINK = ''
process.env.GROQ_MODEL_CODE = ''
process.env.GROQ_MODEL_STUDY = ''
process.env.GROQ_MODEL_RESEARCH = ''
process.env.GROQ_MODEL_VISION = ''

const { resolveRuntimeModels, resolveModelForRequest, normalizeMode, modelForModeSync } = await import(
  '../server/services/models.js'
)
const { isVisionModel, isReasoningModel } = await import('../server/config.js')

test('modes fall back to sane defaults when nothing is configured', () => {
  assert.equal(modelForModeSync('fast'), 'llama-3.3-70b-versatile')
  assert.equal(modelForModeSync('unknown-mode'), 'llama-3.3-70b-versatile')
  assert.equal(normalizeMode('code'), 'code')
  assert.equal(normalizeMode('nonsense'), 'fast')
})

test('runtime models expose one entry per mode without credentials', async () => {
  const runtime = await resolveRuntimeModels()
  const ids = Object.keys(runtime.perMode)
  assert.deepEqual(ids.sort(), ['code', 'fast', 'research', 'study', 'think'])
  for (const mode of ids) {
    assert.ok(runtime.perMode[mode].id)
    assert.equal(JSON.stringify(runtime.perMode).includes('GROQ_API_KEY'), false)
  }
})

test('vision capability detection matches known vision models', () => {
  assert.equal(isVisionModel('meta-llama/llama-4-scout-17b-16e-instruct'), true)
  assert.equal(isVisionModel('meta-llama/llama-3.3-70b-versatile'), false)
  assert.equal(isVisionModel(''), false)
  assert.equal(isReasoningModel('deepseek-r1-distill-llama-70b'), true)
  assert.equal(isReasoningModel('llama-3.3-70b-versatile'), false)
})

test('images are blocked honestly when no vision model is reachable', async () => {
  const resolution = await resolveModelForRequest({ mode: 'fast', hasImages: true })
  assert.equal(resolution.visionBlocked, true)
  assert.ok(resolution.id)
})

test('text-only requests never hit the vision path', async () => {
  const resolution = await resolveModelForRequest({ mode: 'fast', hasImages: false })
  assert.equal(resolution.visionBlocked, undefined)
  assert.equal(resolution.usedVision, undefined)
})