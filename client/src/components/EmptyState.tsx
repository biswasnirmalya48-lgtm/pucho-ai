import { memo } from 'react'
import { Lightbulb, Code2, GraduationCap, FlaskConical, Image as ImageIcon, Search } from 'lucide-react'
import { SUGGESTIONS } from '../lib/i18n'
import { appendToDraft, dict, usePucho } from '../lib/store'

const ICONS = [Lightbulb, Code2, ImageIcon, GraduationCap, FlaskConical, Search]

/** Landing view: brand, tagline and suggestion cards that fill the composer. */
const EmptyState = memo(function EmptyState() {
  const state = usePucho()
  const t = dict()
  const project = state.projects.find((p) => p.id === state.activeProjectId)

  return (
    <div className="empty">
      <div className="empty__mark" aria-hidden="true">
        P
      </div>
      <h1 className="empty__title">{t.emptyTitle}</h1>
      <p className="empty__sub">{t.emptySubtitle}</p>

      {project && (
        <div className="empty__project">
          Working in project: <strong>{project.name}</strong>
        </div>
      )}

      <div className="suggest-grid">
        {SUGGESTIONS.map((suggestion, index) => {
          const Icon = ICONS[index] ?? Lightbulb
          return (
            <button
              key={suggestion.key}
              type="button"
              className="suggest-card"
              onClick={() => {
                appendToDraft(suggestion.prompt)
                window.dispatchEvent(new CustomEvent('pucho:focus-composer'))
              }}
            >
              <span className="suggest-card__icon" aria-hidden="true">
                <Icon size={15} />
              </span>
              <span className="suggest-card__label">{t[suggestion.key]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
})

export default EmptyState