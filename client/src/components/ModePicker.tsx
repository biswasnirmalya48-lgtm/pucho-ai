import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { dict, setMode, usePucho } from '../lib/store'
import type { ModeId } from '../lib/types'

/**
 * Mode selector. The user picks a mode; the server decides which model
 * answers. That split keeps model names out of the interface.
 */
export default function ModePicker() {
  const state = usePucho()
  const t = dict()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const modes = state.status?.modes ?? []
  const active = modes.find((m) => m.id === state.mode)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="composer__mode" ref={wrapRef}>
      <button
        type="button"
        className="mode-switch"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={active?.blurb ?? t.mode}
      >
        <span aria-hidden="true">{active?.icon ?? '⚡'}</span>
        <span className="mode-switch__label">{active?.label ?? 'Fast'}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>

      {open && (
        <div className="mode-menu" role="menu" aria-label={t.mode}>
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="menuitemradio"
              aria-checked={mode.id === state.mode}
              className={`mode-menu__item${mode.id === state.mode ? ' mode-menu__item--active' : ''}`}
              onClick={() => {
                setMode(mode.id as ModeId)
                setOpen(false)
              }}
            >
              <span className="mode-menu__icon" aria-hidden="true">
                {mode.icon}
              </span>
              <span>
                <span className="mode-menu__label">{mode.label}</span>
                <span className="mode-menu__blurb">{mode.blurb}</span>
                {mode.model && <span className="mode-menu__blurb">{mode.model}</span>}
              </span>
              {mode.id === state.mode && (
                <span className="mode-menu__check">
                  <Check size={14} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}