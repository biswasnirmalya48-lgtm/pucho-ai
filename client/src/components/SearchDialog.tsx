import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CornerDownLeft, Loader2, MessageSquare, Search } from 'lucide-react'

import { dict, newChat, openConversation, runSearch, setDraft, setSearchOpen, usePucho } from '../lib/store'
import { formatDateTime } from '../lib/format'

export default function SearchDialog() {
  const state = usePucho()
  const t = dict()
  const [value, setValue] = useState(state.searchQuery)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void runSearch(value), 180)
    return () => window.clearTimeout(timer)
  }, [value])

  useEffect(() => setCursor(0), [state.searchResults.length])

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const results = state.searchResults
  const canStartNew = useMemo(() => value.trim().length > 1, [value])

  const startNew = () => {
    setDraft(value.trim())
    newChat()
    setSearchOpen(false)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((c) => Math.min(c + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const target = results[cursor]
      if (target) {
        void openConversation(target.id)
        setSearchOpen(false)
      } else if (canStartNew) {
        startNew()
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setSearchOpen(false)
    }
  }

  return (
    <div
      className="scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setSearchOpen(false)
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={t.searchChats}>
        <div className="dialog__head">
          <Search size={16} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
          <input
            ref={inputRef}
            className="search-input"
            value={value}
            placeholder={t.searchHint}
            aria-label={t.searchChats}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {state.searchLoading && <Loader2 size={15} className="spinner" aria-label="Searching" />}
          <button type="button" className="icon-btn icon-btn--ghost" onClick={() => setSearchOpen(false)} aria-label={t.cancel}>
            <span className="kbd">esc</span>
          </button>
        </div>

        <div className="dialog__body" ref={listRef}>
          {value.trim().length < 2 ? (
            <p className="field__hint">{t.searchHint}</p>
          ) : results.length === 0 && !state.searchLoading ? (
            <p className="field__hint">{t.noResults}</p>
          ) : (
            <div className="results">
              {results.map((result, index) => (
                <button
                  key={result.id}
                  type="button"
                  data-index={index}
                  className="result"
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => {
                    void openConversation(result.id)
                    setSearchOpen(false)
                  }}
                >
                  <span className="result__title">
                    <MessageSquare
                      size={13}
                      style={{ verticalAlign: '-2px', marginRight: 6, opacity: 0.6 }}
                      aria-hidden="true"
                    />
                    {result.title || t.untitled}
                  </span>
                  {result.snippet && <span className="result__snippet">{result.snippet}</span>}
                  <span className="result__meta">
                    {formatDateTime(result.updatedAt)}
                    {result.matchedIn ? ` · matched in ${result.matchedIn}` : ''}
                    {index === cursor && (
                      <span style={{ marginLeft: 'auto' }}>
                        <CornerDownLeft size={12} />
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {canStartNew && (
          <div className="dialog__foot" style={{ justifyContent: 'space-between' }}>
            <span className="field__hint">{t.newChat} — “{value.trim().slice(0, 40)}”</span>
            <button type="button" className="btn btn--sm" onClick={startNew}>
              Start <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}