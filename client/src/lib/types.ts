export type ModeId = 'fast' | 'think' | 'code' | 'study' | 'research'

export type MessageStatus = 'complete' | 'streaming' | 'stopped' | 'error' | 'notice'

export interface Source {
  title: string
  url: string
  snippet: string
  source: string
}

export interface Attachment {
  id: string
  name: string
  kind: 'image' | 'pdf' | 'docx' | 'doc' | 'text' | 'binary'
  size: number
  mime: string
  url: string
  textUrl?: string
  warning?: string | null
  truncated?: boolean
  textChars?: number
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  mode?: ModeId | null
  status: MessageStatus
  sources?: Source[]
  attachments?: Attachment[]
  position: number
  createdAt: string
  /** client-only */
  streaming?: boolean
  error?: { message: string; code?: string; retryable?: boolean } | null
}

export interface Conversation {
  id: string
  title: string
  mode: ModeId
  projectId: string | null
  archived: boolean
  pinned: boolean
  createdAt: string
  updatedAt: string
  messageCount?: number
  preview?: string
  projectName?: string
}

export interface Project {
  id: string
  name: string
  description: string
  instructions: string
  context: string
  accent: string
  createdAt: string
  updatedAt: string
  conversationCount?: number
  fileCount?: number
}

export interface Settings {
  name: string
  responseStyle: 'simple' | 'balanced' | 'detailed'
  language: 'english' | 'hindi' | 'bengali' | 'hinglish'
  theme: 'dark' | 'light' | 'system'
  defaultMode: ModeId
  autoTitle: boolean
  sendOnEnter: boolean
  voiceInput: boolean
  readAloud: boolean
  speakRate: number
  speechEnabled: boolean
  reducedMotion: boolean
}

export interface ModeInfo {
  id: ModeId
  label: string
  icon: string
  blurb: string
  model: string | null
  vision: boolean
  reasoning: boolean
}

export interface ServerStatus {
  app: { name: string; version: string; tagline: string }
  provider: { configured: boolean; apiUrl: string; singleModel: string | null; modelError: string | null }
  modes: ModeInfo[]
  vision: { available: boolean; model: string | null }
  webSearch: { available: boolean; provider: string | null }
  tts: { available: boolean }
  counts: { conversations: number; projects: number }
  limits: {
    fileBytes: number
    imageBytes: number
    messageChars: number
    filesPerMessage: number
  }
  modeIds: ModeId[]
}

export interface SearchResult {
  id: string
  title: string
  updatedAt: string
  archived: boolean
  projectId: string | null
  snippet?: string
  matchedIn?: 'question' | 'answer'
}

export type ToastKind = 'info' | 'success' | 'error' | 'warning'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
  action?: { label: string; run: () => void }
}

export interface ConfirmRequest {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}