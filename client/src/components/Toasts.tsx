import { dismissToast, usePucho } from '../lib/store'

/** Lightweight, non-blocking notifications. */
export default function Toasts() {
  const { toasts } = usePucho()
  if (!toasts.length) return null

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast--${item.kind}`}>
          <span className="toast__dot" aria-hidden="true" />
          <span>{item.message}</span>
          {item.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                item.action?.run()
                dismissToast(item.id)
              }}
            >
              {item.action.label}
            </button>
          )}
          <button
            type="button"
            className="file-card__remove"
            onClick={() => dismissToast(item.id)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}