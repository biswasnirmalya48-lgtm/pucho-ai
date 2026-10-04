import { memo } from 'react'
import { AlertTriangle, FileCode2, FileText, Image as ImageIcon, X } from 'lucide-react'
import { formatBytes } from '../lib/format'
import type { Attachment } from '../lib/types'

export interface FileCardProps {
  file: Attachment & { pending?: boolean; localPreview?: string }
  onRemove?: () => void
  pending?: boolean
}

const iconFor = (kind: string, mime: string) => {
  if (kind === 'image' || mime?.startsWith('image/')) return ImageIcon
  if (kind === 'pdf' || kind === 'docx' || kind === 'doc' || kind === 'text') return FileText
  return FileCode2
}

export const FileCard = memo(function FileCard({ file, onRemove, pending }: FileCardProps) {
  const Icon = iconFor(file.kind, file.mime)
  return (
    <div
      className={`file-card${pending || file.pending ? ' file-card--pending' : ''}`}
      title={file.warning ?? file.name}
    >
      <span className="file-card__icon">
        {pending || file.pending ? <span className="spinner" /> : <Icon size={14} aria-hidden="true" />}
      </span>
      <span className="file-card__body">
        <span className="file-card__name">{file.name}</span>
        <span className="file-card__meta">
          <span>{formatBytes(file.size)}</span>
          {file.textChars ? <span>· {file.textChars.toLocaleString()} chars read</span> : null}
          {file.truncated ? <span>· truncated</span> : null}
          {file.warning ? (
            <span className="file-card__warn" title={file.warning}>
              <AlertTriangle size={11} />
            </span>
          ) : null}
        </span>
      </span>
      {onRemove && (
        <button type="button" className="file-card__remove" onClick={onRemove} aria-label={`Remove ${file.name}`}>
          <X size={12} />
        </button>
      )}
    </div>
  )
})

export default FileCard