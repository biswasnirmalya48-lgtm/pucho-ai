import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Mic, Plus, Square } from 'lucide-react'

import FileCard from './FileCard'
import { useVoiceInput } from '../hooks/useVoice'
import {
  appendToDraft,
  dict,
  removePendingAttachment,
  sendMessage,
  setDraft,
  stopGeneration,
  toast,
  uploadFiles,
  usePucho,
} from '../lib/store'

const ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  '.pdf',
  '.docx',
  '.doc',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.log',
].join(',')

const QUICK_ACTIONS = [
  { label: 'Summarize this', prompt: 'Summarize the attached file in a few clear bullet points.' },
  { label: 'Explain this', prompt: 'Explain what this file contains and what it is used for.' },
  { label: 'Find errors', prompt: 'Read the attached file and list the errors, bugs and risks you find.' },
  { label: 'Create notes', prompt: 'Turn this file into clean study notes with headings.' },
  { label: 'Ask questions', prompt: 'Ask me five questions about this file to check how well I understood it.' },
]

export default function Composer() {
  const state = usePucho()
  const t = dict()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  const grow = useCallback(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 240)}px`
  }, [])

  useEffect(grow, [grow, state.draft])

  useEffect(() => {
    const focus = () => textareaRef.current?.focus()
    window.addEventListener('pucho:focus-composer', focus)
    return () => window.removeEventListener('pucho:focus-composer', focus)
  }, [])

  const streaming = Boolean(state.streaming)
  const canSend =
    (state.draft.trim().length > 0 || state.pendingAttachments.some((a) => !a.pending)) && !streaming

  const submit = () => {
    if (streaming) return
    if (!canSend) return
    sendMessage()
    window.requestAnimationFrame(() => {
      const node = textareaRef.current
      if (node) node.style.height = 'auto'
    })
  }

  /* ------------------------------ voice ------------------------------- */
  const voiceLang =
    state.settings.language === 'hindi'
      ? 'hi-IN'
      : state.settings.language === 'bengali'
        ? 'bn-IN'
        : state.settings.language === 'hinglish'
          ? 'hi-IN'
          : 'en-IN'

  const voice = useVoiceInput({
    lang: voiceLang,
    onText: (text, isFinal) => {
      setDraft(isFinal ? text : text)
    },
  })

  useEffect(() => {
    if (voice.error) toast('warning', voice.error)
  }, [voice.error])

  /* ---------------------------- attachments --------------------------- */

  const pickFiles = () => fileRef.current?.click()

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.files
    if (items && items.length) {
      event.preventDefault()
      void uploadFiles(Array.from(items))
    }
  }

  // Window-level drag & drop so a drop anywhere in the app works.
  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types?.includes('Files')) return
      dragDepth.current += 1
      setDragging(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes('Files')) event.preventDefault()
    }
    const onDragLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.files?.length) return
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      void uploadFiles(Array.from(event.dataTransfer.files))
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  const attachments = state.pendingAttachments
  const hasImages = attachments.some((a) => a.kind === 'image')

  return (
    <div className="composer-wrap">
      {dragging && <div className="drop-hint">Drop images or files to attach them</div>}

      <form
        className={`composer${dragging ? ' composer--dragging' : ''}`}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {attachments.length > 0 && (
          <div className="composer__attachments">
            {attachments.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                pending={file.pending}
                onRemove={() => removePendingAttachment(file.id)}
              />
            ))}
            <div className="quick-actions">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="quick-action"
                  onClick={() => {
                    appendToDraft(action.prompt)
                    textareaRef.current?.focus()
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="composer__input">
          <button
            type="button"
            className="icon-btn"
            onClick={pickFiles}
            aria-label={t.attach}
            title={t.attach}
          >
            <Plus size={18} />
          </button>

          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const list = event.target.files ? Array.from(event.target.files) : []
              void uploadFiles(list)
              event.target.value = ''
            }}
          />

          <textarea
            ref={textareaRef}
            rows={1}
            value={state.draft}
            placeholder={t.askAnything}
            aria-label={t.askAnything}
            onChange={(event) => {
              setDraft(event.target.value)
              grow()
            }}
            onPaste={onPaste}
            onKeyDown={(event) => {
              const mod = event.metaKey || event.ctrlKey
              if (mod && event.key === 'Enter') {
                event.preventDefault()
                submit()
                return
              }
              if (event.key === 'Enter' && !event.shiftKey && !mod) {
                if (state.settings.sendOnEnter) {
                  event.preventDefault()
                  submit()
                }
              }
            }}
          />

          <div className="composer__actions">
            {state.settings.voiceInput && (
              <button
                type="button"
                className={`icon-btn${voice.listening ? ' mic-btn--live' : ''}`}
                onClick={() => (voice.listening ? voice.stop() : voice.start())}
                aria-label={voice.listening ? 'Stop listening' : t.voice}
                title={voice.supported ? t.voice : 'Voice input is not supported in this browser'}
                disabled={!voice.supported}
              >
                <Mic size={18} />
              </button>
            )}

            {streaming ? (
              <button
                type="button"
                className="send-btn send-btn--stop"
                onClick={stopGeneration}
                aria-label={t.stop}
                title={t.stop}
              >
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                className="send-btn"
                disabled={!canSend}
                aria-label={t.send}
                title={`${t.send} (⌘↵)`}
              >
                <ArrowUp size={17} />
              </button>
            )}
          </div>
        </div>
      </form>

      <p className="composer__hint">
        {voice.listening ? (
          <>
            <span className="status-dot status-dot--off" /> {t.listening}
          </>
        ) : (
          <>
            <span>
              <b>↵</b> send
            </span>
            <span>·</span>
            <span>
              <b>⇧↵</b> new line
            </span>
            {hasImages && !state.status?.vision.available && (
              <>
                <span>·</span>
                <span>Images need a vision-capable model</span>
              </>
            )}
          </>
        )}
      </p>
    </div>
  )
}