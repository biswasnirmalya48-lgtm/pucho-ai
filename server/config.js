import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = path.resolve(__dirname, '..')

// Load .env from the project root, then .env.local (which wins, and is git-ignored).
dotenv.config({ path: path.join(ROOT_DIR, '.env') })
dotenv.config({ path: path.join(ROOT_DIR, '.env.local'), override: true })

const env = process.env
const str = (v, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback)
const int = (v, fallback) => {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const APP_NAME = 'PUCHO'
export const APP_VERSION = '1.0.0'
export const TAGLINE = 'Bas Pucho.'
export const NODE_ENV = str(env.NODE_ENV, 'development')
export const IS_PROD = NODE_ENV === 'production'
export const PORT = int(env.PORT, 8787)
export const HOST = str(env.HOST, '127.0.0.1')
export const DATA_DIR = path.resolve(ROOT_DIR, str(env.DATA_DIR, 'data'))
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
export const DB_PATH = path.join(DATA_DIR, 'pucho.db')
export const CLIENT_DIST = path.join(ROOT_DIR, 'dist')

export function ensureDirs() {
  for (const dir of [DATA_DIR, UPLOAD_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }
}

/* ------------------------------------------------------------------ *
 * GROQ configuration.  The API key never leaves the server process.
 * ------------------------------------------------------------------ */
export const GROQ = {
  apiKey: str(env.GROQ_API_KEY),
  apiUrl: str(env.GROQ_API_URL, 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
  /** Per-mode model ids. Empty = "resolve automatically". */
  models: {
    fast: str(env.GROQ_MODEL_FAST),
    think: str(env.GROQ_MODEL_THINK),
    code: str(env.GROQ_MODEL_CODE),
    study: str(env.GROQ_MODEL_STUDY),
    research: str(env.GROQ_MODEL_RESEARCH),
  },
  /** Optional dedicated vision model used when the user sends images. */
  visionModel: str(env.GROQ_MODEL_VISION),
  /** Single-model setup: used for every mode when no per-mode model is set. */
  singleModel: str(env.GROQ_MODEL),
  requestTimeoutMs: int(env.GROQ_TIMEOUT_MS, 180_000),
  maxOutputTokens: int(env.GROQ_MAX_TOKENS, 4096),
}

export const GROQ_DEFAULTS = {
  fast: 'llama-3.3-70b-versatile',
  think: 'openai/gpt-oss-120b',
  code: 'openai/gpt-oss-120b',
  study: 'llama-3.3-70b-versatile',
  research: 'llama-3.3-70b-versatile',
  lastResort: 'llama-3.3-70b-versatile',
}

/** Models known to accept image input. Unknown ids default to "no vision". */
const VISION_MODELS = new Set([
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b',
  'meta-llama/llama-4-maverick-17b',
])
export function isVisionModel(modelId) {
  if (!modelId) return false
  const id = String(modelId).toLowerCase()
  if (VISION_MODELS.has(id)) return true
  if (/(^|\/)(llama-?4|.*vision.*|.*-vl-.*|.*gemma-3.*|.*pixtral.*|.*qwen.*-vl.*)$/.test(id)) return true
  return false
}

/** Models that emit a separate reasoning stream. */
export function isReasoningModel(modelId) {
  const id = String(modelId || '').toLowerCase()
  return id.includes('deepseek-r1') || id.includes('gpt-oss') || id.includes('qwen3')
}

export const MODES = {
  fast: {
    id: 'fast',
    label: 'Fast',
    icon: '⚡',
    blurb: 'Quick, everyday answers',
    temperature: 0.6,
    maxTokens: GROQ.maxOutputTokens,
    style: 'Be quick and direct. Lead with the answer.',
  },
  think: {
    id: 'think',
    label: 'Think',
    icon: '🧠',
    blurb: 'Hard reasoning and multi-step problems',
    temperature: 0.3,
    maxTokens: GROQ.maxOutputTokens,
    style: 'Reason carefully and step by step. Break the problem down before answering.',
  },
  code: {
    id: 'code',
    label: 'Code',
    icon: '💻',
    blurb: 'Programming help, debugging, architecture',
    temperature: 0.2,
    maxTokens: GROQ.maxOutputTokens,
    style:
      'You are a senior engineer. Give correct, runnable code with fenced code blocks that include a language tag. Explain briefly, mention edge cases and complexity, and never invent APIs you are not sure exist.',
  },
  study: {
    id: 'study',
    label: 'Study',
    icon: '📚',
    blurb: 'Simple explanations that build understanding',
    temperature: 0.5,
    maxTokens: GROQ.maxOutputTokens,
    style:
      'Teach. Use plain language, a short intuition first, then detail, then one concrete analogy and a quick self-check question.',
  },
  research: {
    id: 'research',
    label: 'Research',
    icon: '🔎',
    blurb: 'Deeper, source-backed research',
    temperature: 0.3,
    maxTokens: GROQ.maxOutputTokens,
    style:
      'Research carefully. Synthesise across the provided sources, note disagreements and uncertainty, and be explicit about what is not known.',
  },
}

export const MODE_IDS = Object.keys(MODES)
export const DEFAULT_MODE = 'fast'

export const MODES_UI = MODE_IDS.map((id) => ({
  id,
  label: MODES[id].label,
  icon: MODES[id].icon,
  blurb: MODES[id].blurb,
}))

/* ------------------------------------------------------------------ *
 * Optional provider integrations.  Each one degrades gracefully.
 * ------------------------------------------------------------------ */
export const WEB_SEARCH = {
  provider: str(env.WEB_SEARCH_PROVIDER),
  tavilyKey: str(env.TAVILY_API_KEY),
  serperKey: str(env.SERPER_API_KEY),
  braveKey: str(env.BRAVE_SEARCH_API_KEY),
  /** Endpoints are overridable so the integration can be pointed at a local stub. */
  tavilyUrl: str(env.TAVILY_API_URL, 'https://api.tavily.com/search'),
  serperUrl: str(env.SERPER_API_URL, 'https://google.serper.dev/search'),
  braveUrl: str(env.BRAVE_API_URL, 'https://api.search.brave.com/res/v1/web/search'),
  maxResults: int(env.WEB_SEARCH_MAX_RESULTS, 6),
  timeoutMs: int(env.WEB_SEARCH_TIMEOUT_MS, 20_000),
}

export const TTS = {
  provider: str(env.TTS_PROVIDER), // 'openai' | 'elevenlabs' | ''
  apiKey: str(env.TTS_API_KEY),
  baseUrl: str(env.TTS_API_URL, 'https://api.openai.com/v1'),
  model: str(env.TTS_MODEL, 'gpt-4o-mini-tts'),
  voice: str(env.TTS_VOICE, 'alloy'),
}

/* ------------------------------------------------------------------ *
 * Limits & safety.  Request-size guards live here so there is a single
 * source of truth shared by the HTTP layer and the validation helpers.
 * ------------------------------------------------------------------ */
export const LIMITS = {
  jsonBody: str(env.MAX_JSON_BODY, '2mb'),
  messageChars: int(env.MAX_MESSAGE_CHARS, 32_000),
  historyMessages: int(env.MAX_HISTORY_MESSAGES, 40),
  historyChars: int(env.MAX_HISTORY_CHARS, 120_000),
  fileBytes: int(env.MAX_FILE_BYTES, 20 * 1024 * 1024),
  imageBytes: int(env.MAX_IMAGE_BYTES, 8 * 1024 * 1024),
  filesPerMessage: int(env.MAX_FILES_PER_MESSAGE, 8),
  conversationTitle: 120,
  extractedTextChars: int(env.MAX_EXTRACTED_CHARS, 400_000),
  conversations: int(env.MAX_CONVERSATIONS, 2000),
  projects: int(env.MAX_PROJECTS, 100),
  projectsPerConversation: 1,
}

export const ALLOWED_ORIGINS = str(env.ALLOWED_ORIGINS)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const RATE_LIMITS = {
  chat: { windowMs: 60_000, max: int(env.RATE_LIMIT_CHAT, 45) },
  write: { windowMs: 60_000, max: int(env.RATE_LIMIT_WRITE, 120) },
  upload: { windowMs: 60_000, max: int(env.RATE_LIMIT_UPLOAD, 20) },
  search: { windowMs: 60_000, max: int(env.RATE_LIMIT_SEARCH, 120) },
  read: { windowMs: 60_000, max: int(env.RATE_LIMIT_READ, 600) },
}

export const SUPPORTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])