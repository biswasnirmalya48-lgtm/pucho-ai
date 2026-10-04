import { useEffect, useRef, useState } from 'react'
import { cancelRename, dict, renameConversation, usePucho } from '../lib/store'

export default function RenameDialog() {
  const { renameTarget } = usePucho()
  const t = dict()
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renameTarget) {
      setValue(renameTarget.title)
      window.setTimeout(() => {
        ref.current?.focus()
        ref.current?.select()
      }, 10)
    }
  }, [renameTarget])

  if (!renameTarget) return null

  const submit = () => {
    const next = value.trim()
    if (!next) return
    void renameConversation(renameTarget.id, next)
    cancelRename()
  }

  return (
    <div
      className="scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancelRename()
      }}
    >
      <form
        className="dialog dialog--sm"
        role="dialog"
        aria-modal="true"
        aria-label={t.rename}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="dialog__head">
          <h2 className="dialog__title">{t.rename}</h2>
        </div>
        <div className="dialog__body">
          <div className="field">
            <label className="field__label" htmlFor="rename-input">
              Chat title
            </label>
            <input
              id="rename-input"
              ref={ref}
              className="input"
              value={value}
              maxLength={120}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit()
                if (event.key === 'Escape') cancelRename()
              }}
            />
          </div>
        </div>
        <div className="dialog__foot">
          <button type="button" className="btn" onClick={cancelRename}>
            {t.cancel}
          </button>
          <button type="submit" className="btn btn--primary">
            {t.save}
          </button>
        </div>
      </form>
    </div>
  )
}