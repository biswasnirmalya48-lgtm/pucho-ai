import { memo, useState } from 'react'
import { ChevronDown, Globe } from 'lucide-react'
import { dict } from '../lib/store'
import type { Source } from '../lib/types'

/** Real search results only — every URL here came back from the provider. */
export const Sources = memo(function Sources({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false)
  const t = dict()
  if (!sources?.length) return null

  return (
    <section className="sources" aria-label={t.sources}>
      <button
        type="button"
        className="sources__head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Globe size={14} aria-hidden="true" />
        <span>
          {t.sources} · {sources.length}
        </span>
        <ChevronDown
          size={14}
          style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="sources__list">
          {sources.map((source, index) => (
            <a
              key={`${source.url}-${index}`}
              className="source-item"
              href={source.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              <span className="source-item__title">
                [{index + 1}] {source.title}
              </span>
              <span className="source-item__url">{source.source || source.url}</span>
              {source.snippet && <span className="source-item__snippet">{source.snippet}</span>}
            </a>
          ))}
        </div>
      )}
    </section>
  )
})

export default Sources