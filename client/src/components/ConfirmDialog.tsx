import { useEffect, useRef } from 'react'
import { resolveConfirm, usePucho } from '../lib/store'

export default function ConfirmDialog() {
  const { confirm } = usePucho()
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [confirm?.title])

  if (!confirm) return null

  return (
    <div
      className="scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) resolveConfirm(false)
      }}
    >
      <div className="dialog dialog--sm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="dialog__head">
          <h2 className="dialog__title" id="confirm-title">
            {confirm.title}
          </h2>
        </div>
        <div className="dialog__body">
          <p>{confirm.message}</p>
        </div>
        <div className="dialog__foot">
          <button type="button" className="btn" onClick={() => resolveConfirm(false)}>
            {confirm.cancelLabel}
          </button>
          <button
            ref={ref}
            type="button"
            className={`btn ${confirm.danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => resolveConfirm(true)}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}