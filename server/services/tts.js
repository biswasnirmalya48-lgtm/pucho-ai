/**
 * Optional server-side text-to-speech.  Disabled unless TTS_PROVIDER +
 * TTS_API_KEY are configured; the client always has the browser Speech
 * Synthesis fallback, so voice output is never a hard dependency.
 */
import { TTS } from '../config.js'

export function isTtsAvailable() {
  return Boolean(TTS.provider && TTS.apiKey)
}

export async function synthesize({ text, voice, signal }) {
  if (!isTtsAvailable()) return { status: 'unavailable' }
  const input = String(text || '').slice(0, 4000).trim()
  if (!input) return { status: 'empty' }

  const timeout = AbortSignal.timeout(45_000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const chosenVoice = voice || TTS.voice

  try {
    if (TTS.provider === 'openai') {
      const res = await fetch(`${TTS.baseUrl.replace(/\/+$/, '')}/audio/speech`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TTS.apiKey}` },
        signal: combined,
        body: JSON.stringify({
          model: TTS.model,
          voice: chosenVoice,
          input,
          response_format: 'mp3',
        }),
      })
      if (!res.ok) return { status: 'error', detail: `openai_${res.status}` }
      return { status: 'ok', audio: Buffer.from(await res.arrayBuffer()), mime: 'audio/mpeg' }
    }

    if (TTS.provider === 'elevenlabs') {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${chosenVoice}`, {
        method: 'POST',
        headers: { 'xi-api-key': TTS.apiKey, 'content-type': 'application/json' },
        signal: combined,
        body: JSON.stringify({ text: input, model_id: TTS.model || 'eleven_multilingual_v2' }),
      })
      if (!res.ok) return { status: 'error', detail: `elevenlabs_${res.status}` }
      return { status: 'ok', audio: Buffer.from(await res.arrayBuffer()), mime: 'audio/mpeg' }
    }

    return { status: 'unavailable' }
  } catch (err) {
    return { status: 'error', detail: String(err?.message || err) }
  }
}