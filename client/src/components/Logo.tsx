import { memo } from 'react'

/** The PUCHO mark: a minimal letter P, the same glyph used in the favicon. */
export const Mark = memo(function Mark({ size = 15 }: { size?: number }) {
  return (
    <span className="brand__mark" style={{ fontSize: size }} aria-hidden="true">
      P
    </span>
  )
})

export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <Mark size={16} />
      {!compact && (
        <span>
          <span className="brand__name">PUCHO</span>
          <span className="brand__tag">Bas Pucho.</span>
        </span>
      )}
    </span>
  )
}