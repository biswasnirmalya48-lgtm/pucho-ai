/**
 * Conversation titles.  PUCHO asks the fast model for a short title and
 * always falls back to a deterministic heuristic, so a chat is never left
 * with a blank or placeholder name.
 */
import { complete } from './groq.js'
import { modelForModeSync } from './models.js'
import { LIMITS } from '../config.js'

const FILLER_PREFIX =
  /^(hi|hey|hello|yo|ok|okay|thanks|thank you|please|pls|so|um|uh|well|now|quick question|question)\b[\s,:.!?-]*/i

const QUESTION_PREFIX =
  /^(can you|could you|would you|i want to|i need to|i'd like to|i am looking for|i'm looking for|how do i|how can i|how to|how does|how do|what is|what's|what are|who is|who's|where is|when is|why is|why does|why do|explain|describe|tell me about|help me|write|give me|show me|make me|create|build|list|summarise|summarize)\b\s*/i

/** Deterministic title used when the model call fails or is unavailable. */
export function heuristicTitle(raw = '') {
  let text = String(raw).replace(/\s+/g, ' ').trim()
  if (!text) return 'New Chat'
  let previous
  do {
    previous = text
    text = text.replace(FILLER_PREFIX, '').replace(QUESTION_PREFIX, '')
  } while (text !== previous && text.length > 3)

  text = text.replace(/^(a|an|the)\s+/i, '')
  const words = text.split(' ').filter(Boolean)
  let title = words.slice(0, 7).join(' ')
  if (words.length > 7) title += '…'
  title = title.replace(/[.,;:!?]+$/, '').trim()
  if (!title) title = words.slice(0, 5).join(' ')
  if (!title) return 'New Chat'
  title = title.charAt(0).toUpperCase() + title.slice(1)
  return title.slice(0, LIMITS.conversationTitle)
}

function sanitizeTitle(raw) {
  if (!raw) return ''
  let title = String(raw).split('\n')[0].trim()
  title = title.replace(/^["'`*\-–—#\s]+/, '').replace(/["'`*\s]+$/, '')
  title = title.replace(/^(title|chat title)\s*[:\-]\s*/i, '')
  title = title.replace(/[.。]+$/, '').trim()
  if (!title) return ''
  // Reject echoes, refusals and anything that is obviously not a title.
  if (title.length > 80) return ''
  if (/["“”]{2,}/.test(title)) return ''
  if (/^(i (cannot|can't|am unable)|sorry|as an ai|here('| i)s)\b/i.test(title)) return ''
  if (/^(title|chat)\b/i.test(title)) return ''
  if (title.split(/\s+/).length > 12) return ''
  if (title.length > LIMITS.conversationTitle) title = title.slice(0, LIMITS.conversationTitle).trim()
  return title
}

/**
 * Ask the fast model for a title.  Never throws: on any failure we return
 * the heuristic title so the UI always has something sensible.
 */
export async function generateTitle({ text, signal, timeoutMs = 8000 }) {
  const snippet = String(text || '').trim().slice(0, 1200)
  if (!snippet) return { title: 'New Chat', source: 'fallback' }
  try {
    const timeout = AbortSignal.timeout(timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    const { text: raw } = await complete({
      model: modelForModeSync('fast'),
      temperature: 0.2,
      maxTokens: 24,
      signal: combined,
      messages: [
        {
          role: 'system',
          content:
            'You write short chat titles. Rules: 2 to 6 words. Plain nouns, no quotes, no trailing punctuation, no emoji, no preamble, no explanation. Reply with the title only.',
        },
        { role: 'user', content: `Title for this message:\n"""\n${snippet}\n"""` },
      ],
    })
    const title = sanitizeTitle(raw)
    if (title && title.split(/\s+/).length >= 1 && title.length >= 2) return { title, source: 'model' }
    return { title: heuristicTitle(snippet), source: 'fallback' }
  } catch {
    return { title: heuristicTitle(snippet), source: 'fallback' }
  }
}