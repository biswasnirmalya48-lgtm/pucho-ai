/**
 * API client.  The browser only ever talks to the PUCHO server — the
 * provider credentials stay on the server, so no secret is present in this bundle.
 */
import type {
  Attachment,
  ChatMessage,
  Conversation,
  Project,
  SearchResult,
  ServerStatus,
  Settings,
} from './types'

export class ApiError extends Error {
  status: number
  code: string
  retryable: boolean
  constructor(message: string, { status = 500, code = 'error', retryable = false } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryable = retryable
  }
}

const FALLBACK = "PUCHO couldn't complete that request. Try again in a moment."

async function parseError(res: Response) {
  let message = ''
  let code = 'error'
  let retryable = false
  try {
    const data = await res.json()
    message = data?.error?.message ?? ''
    code = data?.error?.code ?? code
    retryable = Boolean(data?.error?.retryable)
  } catch {
    message = res.statusText || ''
  }
  return new ApiError(message || FALLBACK, { status: res.status, code, retryable })
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: init.body instanceof FormData ? init.headers : { 'content-type': 'application/json', ...(init.headers ?? {}) },
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new ApiError("PUCHO can't reach the server. Check that it is running, then try again.", {
      status: 0,
      code: 'network_error',
      retryable: true,
    })
  }
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const json = (body: unknown) => JSON.stringify(body)

/* ------------------------------- status -------------------------------- */

export const api = {
  status: () => request<ServerStatus>('/api/status'),

  models: () =>
    request<{ models: { id: string }[]; configured: boolean; error: unknown }>('/api/models'),

  /* ---------------------------- conversations --------------------------- */

  listConversations: (params: { archived?: boolean; q?: string } = {}) => {
    const query = new URLSearchParams()
    if (params.archived) query.set('archived', '1')
    if (params.q) query.set('q', params.q)
    const suffix = query.toString() ? `?${query}` : ''
    return request<{ conversations: Conversation[]; total: number }>(`/api/conversations${suffix}`)
  },

  getConversation: (id: string, limit = 200) =>
    request<{
      conversation: Conversation
      messages: ChatMessage[]
      hasMore: boolean
      files: Attachment[]
    }>(`/api/conversations/${id}?limit=${limit}`),

  olderMessages: (id: string, before: number, limit = 40) =>
    request<{ messages: ChatMessage[]; hasMore: boolean }>(
      `/api/conversations/${id}/messages?before=${before}&limit=${limit}`,
    ),

  updateConversation: (id: string, patch: Partial<Conversation>) =>
    request<{ conversation: Conversation }>(`/api/conversations/${id}`, {
      method: 'PATCH',
      body: json(patch),
    }),

  deleteConversation: (id: string) =>
    request<{ ok: boolean; id: string }>(`/api/conversations/${id}`, { method: 'DELETE' }),

  bulkConversations: (op: 'archive_all' | 'delete_all' | 'delete', ids: string[] = []) =>
    request<{ ok: boolean; count: number }>('/api/conversations/bulk', {
      method: 'POST',
      body: json({ op, ids }),
    }),

  search: (q: string) => request<{ results: SearchResult[]; query: string }>(`/api/conversations/search?q=${encodeURIComponent(q)}`),

  /* ------------------------------ projects ------------------------------ */

  listProjects: () => request<{ projects: Project[] }>('/api/projects'),

  getProject: (id: string) =>
    request<{ project: Project; conversations: Conversation[]; files: Attachment[] }>(
      `/api/projects/${id}`,
    ),

  createProject: (body: Partial<Project>) =>
    request<{ project: Project }>('/api/projects', { method: 'POST', body: json(body) }),

  updateProject: (id: string, patch: Partial<Project>) =>
    request<{ project: Project }>(`/api/projects/${id}`, { method: 'PATCH', body: json(patch) }),

  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),

  /* ------------------------------- files -------------------------------- */

  uploadFiles: (files: File[], opts: { projectId?: string | null; conversationId?: string | null } = {}) => {
    const form = new FormData()
    for (const file of files) form.append('files', file)
    if (opts.projectId) form.append('projectId', opts.projectId)
    if (opts.conversationId) form.append('conversationId', opts.conversationId)
    return request<{ files: Attachment[] }>('/api/files', { method: 'POST', body: form })
  },

  fileText: (id: string, limit = 20_000) =>
    request<{ id: string; name: string; kind: string; text: string; truncated: boolean; warning: string | null }>(
      `/api/files/${id}/text?limit=${limit}`,
    ),

  deleteFile: (id: string) => request<{ ok: boolean }>(`/api/files/${id}`, { method: 'DELETE' }),

  /* ------------------------------ settings ------------------------------ */

  settings: () => request<{ settings: Settings }>('/api/settings'),

  updateSettings: (patch: Partial<Settings>) =>
    request<{ settings: Settings }>('/api/settings', { method: 'PATCH', body: json(patch) }),

  resetSettings: () => request<{ settings: Settings }>('/api/settings/reset', { method: 'POST' }),

  /* -------------------------------- voice ------------------------------- */

  tts: async (text: string) => {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: json({ text }),
    })
    if (!res.ok) throw await parseError(res)
    return res.blob()
  },
}

/* ------------------------------- streaming ------------------------------ */

export interface StreamEvents {
  onOpen?: (data: {
    conversationId: string
    messageId: string | null
    mode: string
    projectId: string | null
    replacedIds?: string[]
  }) => void
  onTitle?: (data: { conversationId: string; title: string }) => void
  onMeta?: (data: { conversationId: string; assistantMessageId: string; model: string; mode: string; vision: boolean; notice?: boolean }) => void
  onDelta?: (data: { text: string }) => void
  onSearch?: (data: { status: string; provider?: string | null; count?: number; results?: { title: string; url: string; snippet: string; source: string }[] }) => void
  onDone?: (data: { message: ChatMessage; conversation?: Conversation; elapsedMs?: number }) => void
  onTruncated?: (data: { conversationId: string; messages: ChatMessage[]; removedIds: string[]; conversation?: Conversation }) => void
  onError?: (data: {
    message: string
    code: string
    retryable: boolean
    aborted?: boolean
    partial?: boolean
    assistantMessageId: string | null
    conversation?: Conversation
  }) => void
}

export interface ChatRequest {
  action: 'send' | 'regenerate' | 'continue' | 'truncate'
  conversationId?: string | null
  projectId?: string | null
  mode?: string
  content?: string
  attachmentIds?: string[]
  messageId?: string
  useSearch?: boolean
}

/** POST /api/chat and dispatch Server-Sent Events to the callbacks. */
export async function streamChat(
  body: ChatRequest,
  handlers: StreamEvents,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: json(body),
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return
    handlers.onError?.({
      message: "PUCHO can't reach the server. Check that it is running, then try again.",
      code: 'network_error',
      retryable: true,
      assistantMessageId: null,
    })
    return
  }

  if (!res.ok) {
    const error = await parseError(res)
    handlers.onError?.({
      message: error.message,
      code: error.code,
      retryable: error.retryable,
      assistantMessageId: null,
    })
    return
  }
  if (!res.body) {
    handlers.onError?.({
      message: FALLBACK,
      code: 'empty_stream',
      retryable: true,
      assistantMessageId: null,
    })
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const dispatch = (block: string) => {
    let event = 'message'
    const dataLines: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (!dataLines.length) return
    let payload: unknown
    try {
      payload = JSON.parse(dataLines.join('\n'))
    } catch {
      return
    }
    switch (event) {
      case 'open':
        handlers.onOpen?.(payload as never)
        break
      case 'title':
        handlers.onTitle?.(payload as never)
        break
      case 'meta':
        handlers.onMeta?.(payload as never)
        break
      case 'delta':
        handlers.onDelta?.(payload as never)
        break
      case 'search':
        handlers.onSearch?.(payload as never)
        break
      case 'done':
        handlers.onDone?.(payload as never)
        break
      case 'truncated':
        handlers.onTruncated?.(payload as never)
        break
      case 'error':
        handlers.onError?.(payload as never)
        break
      default:
        break
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let index = buffer.indexOf('\n\n')
      while (index !== -1) {
        const block = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (block.trim() && !block.startsWith(':')) dispatch(block)
        index = buffer.indexOf('\n\n')
      }
    }
    buffer += decoder.decode()
    if (buffer.trim() && !buffer.startsWith(':')) dispatch(buffer)
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return
    handlers.onError?.({
      message: 'PUCHO lost the connection mid-answer. Check your network and try again.',
      code: 'stream_interrupted',
      retryable: true,
      assistantMessageId: null,
    })
  }
}