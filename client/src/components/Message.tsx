import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react'
import {
  Check,
  Copy,
  CornerDownRight,
  Pencil,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-react'

import Sources from './Sources'
import FileCard from './FileCard'
import { dict } from '../lib/store'
import type { ChatMessage } from '../lib/types'

/**
 * The markdown/highlight/KaTeX bundle is the heaviest thing in the app, so it
 * loads on demand: the first paint shows plain text, then rich rendering
 * swaps in. Streamed deltas stay readable either way.
 */
const Markdown = lazy(() => import('./Markdown'))

const MarkdownBlock = memo(function MarkdownBlock({ content }: { content: string }) {
  return (
    <Suspense fallback={<div className="md md--plain">{content}</div>}>
      <Markdown content={content} />
    </Suspense>
  )
})

interface Props {
  message: ChatMessage
  isLast: boolean
  streaming?: boolean
  editing?: boolean
  userInitial: string
  speechEnabled: boolean
  speaking?: boolean
  onRegenerate: () => void
  onRetry: () => void
  onContinue: () => void
  onEdit: () => void
  onEditChange: (value: string) => void
  onEditCancel: () => void
  onEditSubmit: () => void
  onSpeak: () => void
}

function EditBox({
  value,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: string
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const t = dict()
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [])

  return (
    <div className="edit-box">
      <textarea
        ref={ref}
        className="input"
        value={value}
        rows={3}
        aria-label={t.edit}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            onSubmit()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
      />
      <div className="edit-box__actions">
        <button type="button" className="btn btn--sm" onClick={onCancel}>
          {t.cancel}
        </button>
        <button type="button" className="btn btn--sm btn--primary" onClick={onSubmit}>
          {t.save}
        </button>
      </div>
    </div>
  )
}

const Message = memo(function Message(props: Props) {
  const { message, isLast, streaming, editing, userInitial } = props
  const t = dict()
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — text stays selectable */
    }
  }

  const images = (message.attachments ?? []).filter((a) => a.kind === 'image')
  const files = (message.attachments ?? []).filter((a) => a.kind !== 'image')
  const showThinking = !isUser && streaming && !message.content
  const showCaret = !isUser && streaming && !!message.content

  return (
    <article className={`msg msg--${isUser ? 'user' : 'assistant'}`} data-mode={message.mode ?? undefined}>
      <div className="msg__avatar" aria-hidden="true">
        {isUser ? userInitial : 'P'}
      </div>

      <div className="msg__body">
        {images.length > 0 && (
          <div className="attach-row attach-row--start">
            {images.map((image) => (
              <a key={image.id} href={image.url} target="_blank" rel="noopener noreferrer">
                <img className="file-thumb" src={image.url} alt={image.name} loading="lazy" />
              </a>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <div className="attach-row attach-row--start">
            {files.map((file) => (
              <FileCard key={file.id} file={file} />
            ))}
          </div>
        )}

        {editing && isUser ? (
          <EditBox
            value={message.content}
            onChange={props.onEditChange}
            onCancel={props.onEditCancel}
            onSubmit={props.onEditSubmit}
          />
        ) : showThinking ? (
          <div className="thinking" role="status" aria-live="polite">
            <span className="thinking__dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>{t.thinking}</span>
          </div>
        ) : isUser ? (
          <div className="bubble">{message.content}</div>
        ) : message.status === 'notice' ? (
          <div className="msg__notice">
            <MarkdownBlock content={message.content} />
          </div>
        ) : (
          <div className="bubble">
            <MarkdownBlock content={message.content} />
            {showCaret && <span className="caret" aria-hidden="true" />}
          </div>
        )}

        {!isUser && message.status === 'stopped' && (
          <div className="stopped-flag">
            <span>Stopped early</span>
          </div>
        )}

        {message.error && (
          <div className="msg__error" role="alert">
            <div>
              <strong>
                {isUser ? 'PUCHO could not send that' : 'PUCHO could not finish that answer'}
              </strong>
              {message.error.message}
            </div>
            <button
              type="button"
              className="btn btn--sm"
              onClick={isUser ? props.onRetry : props.onRegenerate}
            >
              <RefreshCw size={13} />
              {isUser ? 'Try again' : t.regenerate}
            </button>
          </div>
        )}

        {!isUser && message.sources && message.sources.length > 0 && <Sources sources={message.sources} />}

        {!streaming && !editing && (
          <div className="msg__actions">
            <button type="button" className="msg__action" onClick={copy} aria-label={t.copyResponse}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? t.copied : t.copy}</span>
            </button>

            {/* Users can edit any of their messages; regenerate/continue only apply
                to the latest answer. */}
            {(isUser || isLast) && (
              <button
                type="button"
                className="msg__action"
                onClick={isUser ? props.onEdit : props.onRegenerate}
                aria-label={isUser ? t.edit : t.regenerate}
              >
                {isUser ? <Pencil size={13} /> : <RefreshCw size={13} />}
                <span>{isUser ? t.edit : t.regenerate}</span>
              </button>
            )}

            {!isUser && isLast && (
              <button type="button" className="msg__action" onClick={props.onContinue} aria-label={t.continue}>
                <CornerDownRight size={13} />
                <span>{t.continue}</span>
              </button>
            )}

            {!isUser && props.speechEnabled && (
              <button
                type="button"
                className="msg__action"
                onClick={props.onSpeak}
                aria-label={t.readAloud}
              >
                {props.speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                <span>{props.speaking ? t.stop : t.readAloud}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
})

export default Message