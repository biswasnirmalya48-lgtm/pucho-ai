import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'

import EmptyState from './EmptyState'
import Message from './Message'
import { useSpeech } from '../hooks/useVoice'
import {
  continueMessage,
  dict,
  editUserMessage,
  loadOlderMessages,
  regenerate,
  requestConfirm,
  retryMessage,
  setEditingMessage,
  usePucho,
} from '../lib/store'

interface Props {
  speechEnabled: boolean
  userInitial: string
}

const Thread = memo(function Thread({ speechEnabled, userInitial }: Props) {
  const state = usePucho()
  const t = dict()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [draftEdit, setDraftEdit] = useState('')

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior })
  }, [])

  const onScroll = useCallback(() => {
    const node = scrollRef.current
    if (!node) return
    setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 140)
  }, [])

  // The store dispatches this while deltas arrive so streaming keeps the view pinned.
  useEffect(() => {
    const handler = () => {
      const node = scrollRef.current
      if (!node) return
      const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 220
      if (nearBottom || state.streaming) node.scrollTop = node.scrollHeight
    }
    window.addEventListener('pucho:scroll', handler)
    return () => window.removeEventListener('pucho:scroll', handler)
  }, [state.streaming])

  useEffect(() => {
    if (state.streaming) scrollToBottom('auto')
  }, [state.streaming?.phase, scrollToBottom])

  const messages = state.messages
  const lastId = messages.length ? messages[messages.length - 1].id : null
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const speech = useSpeech()

  const onSpeak = (id: string, text: string) => {
    if (speakingId === id) {
      speech.stop()
      setSpeakingId(null)
      return
    }
    speech.speak(text, state.settings.speakRate)
    setSpeakingId(id)
  }

  // Stop any narration when the user starts a new request.
  useEffect(() => {
    if (state.streaming) {
      speech.stop()
      setSpeakingId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.streaming])

  /**
   * Editing a message re-asks PUCHO and drops everything after it, so we only
   * interrupt with a confirmation when another of the user's turns is lost.
   */
  const beginEdit = (id: string, content: string, hasLater: boolean) => {
    if (!hasLater) {
      setDraftEdit(content)
      setEditingMessage(id)
      return
    }
    requestConfirm({
      title: 'Edit this message?',
      message: 'Editing removes PUCHO’s answers that came after it and asks again.',
      confirmLabel: 'Edit message',
      cancelLabel: t.cancel,
      onConfirm: () => {
        setDraftEdit(content)
        setEditingMessage(id)
      },
    })
  }

  return (
    <div className="thread scroll" ref={scrollRef} onScroll={onScroll}>
      <div className="thread__inner">
        {state.hasMoreMessages && (
          <div className="load-earlier">
            <button type="button" onClick={() => void loadOlderMessages()} disabled={state.messagesLoading}>
              {state.messagesLoading ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}

        {messages.length === 0 && !state.streaming ? (
          <EmptyState />
        ) : (
          messages.map((message) => {
            const isLast = message.id === lastId
            const isStreaming = Boolean(state.streaming && message.id === state.streaming?.assistantMessageId)
            return (
              <Message
                key={message.id}
                message={message}
                isLast={isLast}
                streaming={isStreaming}
                editing={state.editingMessageId === message.id}
                userInitial={userInitial}
                speechEnabled={speechEnabled && speech.supported}
                speaking={speakingId === message.id}
                onRegenerate={() => regenerate(message.id)}
                onRetry={() => void retryMessage(message)}
                onContinue={() => continueMessage(message.id)}
                onEdit={() => {
                  const laterUserTurn = messages.some(
                    (m) => m.role === 'user' && m.position > message.position,
                  )
                  beginEdit(message.id, message.content, laterUserTurn)
                }}
                onEditChange={setDraftEdit}
                onEditCancel={() => setEditingMessage(null)}
                onEditSubmit={() => {
                  const id = state.editingMessageId
                  setEditingMessage(null)
                  if (id) void editUserMessage(id, draftEdit)
                }}
                onSpeak={() => onSpeak(message.id, message.content)}
              />
            )
          })
        )}

        {state.streaming?.phase === 'searching' && (
          <div className="searching-flag">
            <span className="spinner" aria-hidden="true" />
            {t.searchingWeb}
          </div>
        )}
      </div>

      {!atBottom && (
        <button
          type="button"
          className="scroll-bottom"
          onClick={() => scrollToBottom()}
          aria-label="Scroll to latest"
        >
          <ArrowDown size={16} />
        </button>
      )}
    </div>
  )
})

export default Thread