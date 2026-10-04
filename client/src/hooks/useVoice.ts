/**
 * Voice input (Web Speech API) and read-aloud (Speech Synthesis).
 *
 * Both are progressive enhancements: PUCHO works fully without them and
 * reports honestly when the browser has no support.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | null
}

export function useVoiceInput({
  onText,
  lang = 'en-IN',
}: {
  onText: (text: string, isFinal: boolean) => void
  lang?: string
}) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef('')
  const ctorRef = useRef(getRecognitionCtor())

  useEffect(() => {
    setSupported(Boolean(ctorRef.current))
  }, [])

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* already stopped */
    }
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Ctor = ctorRef.current
    if (!Ctor) {
      setError('This browser has no speech recognition.')
      return
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {
        /* ignore */
      }
    }
    setError(null)
    finalRef.current = ''
    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) finalRef.current += `${transcript} `
        else interim += transcript
      }
      const combined = `${finalRef.current}${interim}`.trim()
      if (combined) onText(combined, !interim)
    }
    recognition.onerror = (event: any) => {
      const code = event?.error
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setError('Microphone permission is blocked for this site.')
      } else if (code === 'no-speech') {
        setError('No speech detected — try again.')
      } else if (code && code !== 'aborted') {
        setError('Voice input stopped unexpectedly.')
      }
      setListening(false)
    }
    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch {
      setListening(false)
      setError('Voice input could not start.')
    }
  }, [lang, onText])

  useEffect(() => () => {
    try {
      recognitionRef.current?.abort()
    } catch {
      /* ignore */
    }
  }, [])

  return { supported, listening, error, start, stop }
}

/** Read-aloud using the browser's own voices. */
export function useSpeech({ voiceHint }: { voiceHint?: string } = {}) {
  const [supported, setSupported] = useState(false)
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window)
  }, [])

  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  const speak = useCallback(
    (text: string, rate = 1) => {
      if (!supported || !text.trim()) return
      try {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text.slice(0, 4000))
        utterance.rate = Math.min(2, Math.max(0.5, rate))
        const voices = window.speechSynthesis.getVoices()
        const match = voiceHint ? voices.find((v) => v.lang === voiceHint) : undefined
        if (match) utterance.voice = match
        utterance.onend = () => setSpeaking(false)
        utterance.onerror = () => setSpeaking(false)
        window.speechSynthesis.speak(utterance)
        setSpeaking(true)
      } catch {
        setSpeaking(false)
      }
    },
    [supported, voiceHint],
  )

  useEffect(
    () => () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    },
    [],
  )

  return { supported, speaking, speak, stop }
}