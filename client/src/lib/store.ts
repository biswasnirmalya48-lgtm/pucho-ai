/**
 * Application state + actions.
 *
 * A tiny external store (subscribe / getSnapshot) keeps the data flow obvious
 * and avoids re-rendering the whole app: components subscribe to the store and
 * heavy subtrees are memoised.  Streamed deltas are batched per animation
 * frame so a fast model cannot flood React.
 */
import { useSyncExternalStore } from 'react'
import { api, ApiError, streamChat, type ChatRequest } from './api'
import { dictFor, type Lang } from './i18n'
import type {
  Attachment,
  ChatMessage,
  ConfirmRequest,
  Conversation,
  ModeId,
  Project,
  SearchResult,
  ServerStatus,
  Settings,
  Toast,
} from './types'

const DRAFT_KEY = 'pucho.draft'
const THEME_KEY = 'pucho.theme'

export type ViewId = 'chat' | 'projects' | 'settings'

export interface PendingAttachment extends Attachment {
  /** Data URL for immediate preview of a just-picked image. */
  localPreview?: string
  pending?: boolean
}

export interface StreamingState {
  conversationId: string
  assistantMessageId: string | null
  phase: 'thinking' | 'searching' | 'streaming'
  searchStatus: string | null
  startedAt: number
  action: ChatRequest['action']
}

export interface State {
  ready: boolean
  bootError: string | null
  status: ServerStatus | null
  settings: Settings
  view: ViewId
  conversations: Conversation[]
  archived: Conversation[]
  archivedLoaded: boolean
  projects: Project[]
  activeConversationId: string | null
  conversation: Conversation | null
  messages: ChatMessage[]
  messagesLoading: boolean
  hasMoreMessages: boolean
  mode: ModeId
  activeProjectId: string | null
  draft: string
  pendingAttachments: PendingAttachment[]
  uploading: number
  streaming: StreamingState | null
  stopping: boolean
  sidebarOpen: boolean
  searchOpen: boolean
  searchQuery: string
  searchResults: SearchResult[]
  searchLoading: boolean
  toasts: Toast[]
  confirm: ConfirmRequest | null
  renameTarget: Conversation | null
  editingMessageId: string | null
}

const DEFAULT_SETTINGS: Settings = {
  name: '',
  responseStyle: 'balanced',
  language: 'english',
  theme: 'dark',
  defaultMode: 'fast',
  autoTitle: true,
  sendOnEnter: true,
  voiceInput: true,
  readAloud: false,
  speakRate: 1,
  speechEnabled: false,
  reducedMotion: false,
}

let state: State = {
  ready: false,
  bootError: null,
  status: null,
  settings: DEFAULT_SETTINGS,
  view: 'chat',
  conversations: [],
  archived: [],
  archivedLoaded: false,
  projects: [],
  activeConversationId: null,
  conversation: null,
  messages: [],
  messagesLoading: false,
  hasMoreMessages: false,
  mode: DEFAULT_SETTINGS.defaultMode,
  activeProjectId: null,
  draft: '',
  pendingAttachments: [],
  uploading: 0,
  streaming: null,
  stopping: false,
  sidebarOpen: false,
  searchOpen: false,
  searchQuery: '',
  searchResults: [],
  searchLoading: false,
  toasts: [],
  confirm: null,
  renameTarget: null,
  editingMessageId: null,
}

const listeners = new Set<() => void>()

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getState(): State {
  return state
}

export function setState(patch: Partial<State> | ((prev: State) => Partial<State>)) {
  const next = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

export function usePucho(): State {
  return useSyncExternalStore(subscribe, getState, getState)
}

/* ------------------------------- helpers ------------------------------- */

export const uid = () => `local_${Math.random().toString(36).slice(2, 10)}`

const safeStorage = {
  get(key: string) {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      /* storage disabled — drafts simply do not persist */
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

export function applyMotion(reduced: boolean) {
  document.documentElement.dataset.motion = reduced ? 'reduced' : 'normal'
}

export function applyTheme(theme: Settings['theme']) {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme
  document.documentElement.dataset.theme = resolved
  safeStorage.set(THEME_KEY, theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#f7f7f8' : '#0b0b0d')
}

const draftKey = (conversationId: string | null) =>
  `${DRAFT_KEY}:${conversationId ?? 'new'}`

function readDraft(conversationId: string | null) {
  return safeStorage.get(draftKey(conversationId)) ?? ''
}

function writeDraft(conversationId: string | null, value: string) {
  if (value) safeStorage.set(draftKey(conversationId), value)
  else safeStorage.remove(draftKey(conversationId))
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error && err.message) return err.message
  return fallback
}

/* -------------------------------- toasts ------------------------------- */

let toastSeq = 0

export const toast = (kind: Toast['kind'], message: string, action?: Toast['action']) => {
  toastSeq += 1
  const id = `toast_${toastSeq}`
  setState((prev) => ({ toasts: [...prev.toasts.slice(-3), { id, kind, message, action }] }))
  const ttl = kind === 'error' ? 8000 : 4000
  window.setTimeout(() => dismissToast(id), ttl)
}

export function dismissToast(id: string) {
  setState((prev) => ({ toasts: prev.toasts.filter((t) => t.id !== id) }))
}

export function requestConfirm(request: ConfirmRequest) {
  setState({ confirm: request })
}

export function resolveConfirm(confirmed: boolean) {
  const request = state.confirm
  setState({ confirm: null })
  if (confirmed && request) void request.onConfirm()
}

/* ------------------------------- settings ------------------------------ */

export async function refreshStatus() {
  try {
    const status = await api.status()
    setState({ status })
  } catch (err) {
    setState({ bootError: errorMessage(err, 'PUCHO cannot reach the server.') })
  }
}

export async function updateSettings(patch: Partial<Settings>, { silent = false } = {}) {
  const previous = state.settings
  const next = { ...previous, ...patch }
  setState({ settings: next })
  if (patch.theme) applyTheme(patch.theme)
  if (patch.reducedMotion !== undefined) applyMotion(patch.reducedMotion)
  if (!silent) toast('success', dictFor(next.language).settingsSaved)
  try {
    const { settings } = await api.updateSettings(patch)
    setState({ settings })
  } catch (err) {
    setState({ settings: previous })
    toast('error', errorMessage(err, 'Settings could not be saved.'))
  }
}

/* ----------------------------- conversations --------------------------- */

export async function refreshConversations() {
  try {
    const { conversations } = await api.listConversations()
    setState({ conversations })
  } catch (err) {
    toast('error', errorMessage(err, 'Could not load your chats.'))
  }
}

export async function refreshArchived() {
  try {
    const { conversations } = await api.listConversations({ archived: true })
    setState({ archived: conversations, archivedLoaded: true })
  } catch (err) {
    toast('error', errorMessage(err, 'Could not load archived chats.'))
  }
}

export async function refreshProjects() {
  try {
    const { projects } = await api.listProjects()
    setState({ projects })
  } catch {
    /* projects are optional context; failure must not break the chat */
  }
}

export async function openConversation(id: string, options: { silent?: boolean } = {}) {
  if (!id) return
  if (state.streaming) return
  const { silent = false } = options
  setState({ messagesLoading: !silent, searchOpen: false, sidebarOpen: false, view: 'chat' })
  try {
    const data = await api.getConversation(id)
    setState({
      conversation: data.conversation,
      activeConversationId: data.conversation.id,
      messages: data.messages,
      hasMoreMessages: Boolean(data.hasMore),
      mode: data.conversation.mode,
      draft: readDraft(data.conversation.id),
      messagesLoading: false,
      editingMessageId: null,
      activeProjectId: data.conversation.projectId ?? state.activeProjectId,
    })
  } catch (err) {
    setState({ messagesLoading: false })
    toast('error', errorMessage(err, 'That chat could not be opened.'))
    if (err instanceof ApiError && err.code === 'not_found') {
      await refreshConversations()
      newChat()
    }
  }
}

export function newChat() {
  if (state.streaming) stopGeneration()
  setState({
    activeConversationId: null,
    conversation: null,
    messages: [],
    hasMoreMessages: false,
    draft: readDraft(null),
    view: 'chat',
    sidebarOpen: false,
    searchOpen: false,
    editingMessageId: null,
    pendingAttachments: [],
  })
}

export async function loadOlderMessages() {
  const { conversation, messages, hasMoreMessages } = state
  if (!conversation || !hasMoreMessages || state.messagesLoading) return
  const first = messages[0]
  if (!first) return
  setState({ messagesLoading: true })
  try {
    const older = await api.olderMessages(conversation.id, first.position)
    setState((prev) => ({
      messages: [...older.messages, ...prev.messages].filter(
        (m, i, all) => all.findIndex((x) => x.id === m.id) === i,
      ),
      hasMoreMessages: older.hasMore,
      messagesLoading: false,
    }))
  } catch {
    setState({ messagesLoading: false })
  }
}

export async function renameConversation(id: string, title: string) {
  const clean = title.trim()
  if (!clean) return
  setState((prev) => ({
    conversations: prev.conversations.map((c) => (c.id === id ? { ...c, title: clean } : c)),
    conversation: prev.conversation?.id === id ? { ...prev.conversation, title: clean } : prev.conversation,
    renameTarget: null,
  }))
  try {
    await api.updateConversation(id, { title: clean })
  } catch (err) {
    toast('error', errorMessage(err, 'The chat could not be renamed.'))
    void refreshConversations()
  }
}

export function requestRename(conversation: Conversation) {
  setState({ renameTarget: conversation })
}

export function cancelRename() {
  setState({ renameTarget: null })
}

export async function toggleArchive(conversation: Conversation) {
  const archived = !conversation.archived
  setState((prev) => ({
    conversations: prev.conversations.filter((c) => c.id !== conversation.id),
    archived: archived
      ? [{ ...conversation, archived: true }, ...prev.archived]
      : prev.archived.filter((c) => c.id !== conversation.id),
    archivedLoaded: archived ? true : prev.archivedLoaded,
  }))
  if (state.activeConversationId === conversation.id) newChat()
  try {
    await api.updateConversation(conversation.id, { archived })
    if (!archived) await refreshArchived()
    toast('success', archived ? 'Chat archived' : 'Chat restored')
  } catch (err) {
    toast('error', errorMessage(err, 'That chat could not be archived.'))
    void refreshConversations()
  }
}

export async function deleteConversation(id: string) {
  const target = state.conversations.find((c) => c.id === id) ?? state.conversation
  // Optimistic: remove everywhere, and make sure we never sit on a blank screen.
  setState((prev) => ({
    conversations: prev.conversations.filter((c) => c.id !== id),
    archived: prev.archived.filter((c) => c.id !== id),
  }))
  if (state.activeConversationId === id) {
    setState({
      activeConversationId: null,
      conversation: null,
      messages: [],
      hasMoreMessages: false,
      draft: readDraft(null),
    })
  }
  try {
    await api.deleteConversation(id)
    toast('success', `Deleted “${target?.title || 'chat'}”`)
  } catch (err) {
    toast('error', errorMessage(err, 'That chat could not be deleted.'))
    void refreshConversations()
  }
}

export function deleteActiveChat() {
  const conversation = state.conversation
  if (!conversation) return
  requestConfirm({
    title: dictFor(state.settings.language).deleteChat,
    message: dictFor(state.settings.language).deleteChatBody,
    confirmLabel: dictFor(state.settings.language).delete,
    cancelLabel: dictFor(state.settings.language).cancel,
    danger: true,
    onConfirm: () => deleteConversation(conversation.id),
  })
}

export async function deleteAllChats() {
  try {
    await api.bulkConversations('delete_all')
    setState({
      conversations: [],
      archived: [],
      messages: [],
      conversation: null,
      activeConversationId: null,
      hasMoreMessages: false,
    })
    newChat()
    toast('success', 'All chats deleted')
  } catch (err) {
    toast('error', errorMessage(err, 'Chats could not be deleted.'))
  }
}

export async function exportChats() {
  try {
    const [{ conversations }, { conversations: archived }] = await Promise.all([
      api.listConversations(),
      api.listConversations({ archived: true }),
    ])
    const all = [...conversations, ...archived]
    const chunks: { title: string; mode: string; project: string; messages: ChatMessage[] }[] = []
    for (const conversation of all) {
      try {
        const data = await api.getConversation(conversation.id, 500)
        chunks.push({
          title: data.conversation.title,
          mode: data.conversation.mode,
          project: data.conversation.projectId ?? '',
          messages: data.messages,
        })
      } catch {
        /* skip conversations we cannot read instead of failing the export */
      }
    }
    const blob = new Blob([JSON.stringify({ app: 'PUCHO', exportedAt: new Date().toISOString(), chats: chunks }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `pucho-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast('success', `Exported ${chunks.length} chats`)
  } catch (err) {
    toast('error', errorMessage(err, 'Export failed.'))
  }
}

/* -------------------------------- search ------------------------------- */

let searchSeq = 0

export async function runSearch(query: string) {
  const trimmed = query.trim()
  setState({ searchQuery: query })
  if (trimmed.length < 2) {
    setState({ searchResults: [], searchLoading: false })
    return
  }
  const seq = ++searchSeq
  setState({ searchLoading: true })
  try {
    const { results } = await api.search(trimmed)
    if (seq !== searchSeq) return
    setState({ searchResults: results, searchLoading: false })
  } catch (err) {
    if (seq !== searchSeq) return
    setState({ searchResults: [], searchLoading: false })
    toast('error', errorMessage(err, 'Search failed.'))
  }
}

export function setSearchOpen(open: boolean) {
  setState({ searchOpen: open })
  if (!open) {
    setState({ searchQuery: '', searchResults: [] })
    searchSeq += 1
  }
}

/* -------------------------------- projects ----------------------------- */

export async function createProject(input: Partial<Project>) {
  try {
    const { project } = await api.createProject(input)
    setState((prev) => ({ projects: [project, ...prev.projects] }))
    toast('success', `Project “${project.name}” created`)
    return project
  } catch (err) {
    toast('error', errorMessage(err, 'The project could not be created.'))
    return null
  }
}

export async function updateProject(id: string, patch: Partial<Project>) {
  setState((prev) => ({
    projects: prev.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }))
  try {
    await api.updateProject(id, patch)
  } catch (err) {
    toast('error', errorMessage(err, 'The project could not be saved.'))
    void refreshProjects()
  }
}

export async function deleteProject(id: string) {
  const project = state.projects.find((p) => p.id === id)
  setState((prev) => ({
    projects: prev.projects.filter((p) => p.id !== id),
    conversations: prev.conversations.map((c) => (c.projectId === id ? { ...c, projectId: null } : c)),
  }))
  if (state.activeProjectId === id) setState({ activeProjectId: null })
  try {
    await api.deleteProject(id)
    toast('success', `Project “${project?.name ?? ''}” deleted`)
  } catch (err) {
    toast('error', errorMessage(err, 'The project could not be deleted.'))
    void refreshProjects()
  }
}

export function setActiveProject(projectId: string | null) {
  setState({ activeProjectId: projectId, view: projectId ? 'chat' : state.view })
}

/* -------------------------------- mode --------------------------------- */

export function setMode(mode: ModeId) {
  if (state.mode === mode) return
  setState({ mode })
  const conversation = state.conversation
  if (conversation && conversation.mode !== mode) {
    setState((prev) => ({
      conversations: prev.conversations.map((c) => (c.id === conversation.id ? { ...c, mode } : c)),
      conversation: { ...conversation, mode },
    }))
    void api.updateConversation(conversation.id, { mode }).catch(() => {
      /* mode persistence is best-effort */
    })
  }
}

/* ------------------------------ composer ------------------------------- */

export function setDraft(value: string) {
  setState({ draft: value })
  writeDraft(state.activeConversationId, value)
}

export function clearDraft() {
  setState({ draft: '' })
  writeDraft(state.activeConversationId, '')
}

export function appendToDraft(value: string) {
  const next = state.draft ? `${state.draft}\n${value}` : value
  setDraft(next)
}

export async function uploadFiles(list: File[]) {
  if (!list.length) return
  const { fileBytes, imageBytes, filesPerMessage } = state.status?.limits ?? {
    fileBytes: 20 * 1024 * 1024,
    imageBytes: 8 * 1024 * 1024,
    filesPerMessage: 8,
  }
  const accepted: File[] = []
  for (const file of list) {
    if (file.size > (file.type.startsWith('image/') ? imageBytes : fileBytes)) {
      toast('error', `“${file.name}” is larger than the ${Math.round((file.type.startsWith('image/') ? imageBytes : fileBytes) / 1048576)} MB limit.`)
      continue
    }
    accepted.push(file)
  }
  if (!accepted.length) return
  if (state.pendingAttachments.length + accepted.length > filesPerMessage) {
    toast('warning', `PUCHO takes up to ${filesPerMessage} files per message.`)
  }

  const pending: PendingAttachment[] = accepted.map((file) => ({
    id: uid(),
    name: file.name,
    kind: file.type.startsWith('image/') ? 'image' : 'text',
    size: file.size,
    mime: file.type,
    url: '',
    localPreview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    pending: true,
  }))
  setState((prev) => ({ pendingAttachments: [...prev.pendingAttachments, ...pending], uploading: prev.uploading + 1 }))

  try {
    const { files: uploaded } = await api.uploadFiles(accepted, {
      projectId: state.activeProjectId,
      conversationId: state.activeConversationId,
    })
    setState((prev) => {
      const result = [...prev.pendingAttachments]
      for (const file of uploaded) {
        const index = result.findIndex((item) => item.pending && item.name === file.name && item.size === file.size)
        if (index !== -1) result[index] = { ...file }
      }
      return {
        pendingAttachments: result.filter((item) => !item.pending),
        uploading: Math.max(0, prev.uploading - 1),
      }
    })
    const unreadable = uploaded.find((f) => f.warning)
    if (unreadable) toast('warning', unreadable.warning as string)
  } catch (err) {
    setState((prev) => ({
      pendingAttachments: prev.pendingAttachments.filter((item) => !item.pending),
      uploading: Math.max(0, prev.uploading - 1),
    }))
    toast('error', errorMessage(err, 'That upload did not work.'))
  }
}

export function removePendingAttachment(id: string) {
  setState((prev) => ({
    pendingAttachments: prev.pendingAttachments.filter((item) => item.id !== id),
  }))
}

/* ------------------------------- streaming ------------------------------ */

let streamController: AbortController | null = null
let pendingDelta = ''
let flushHandle: number | null = null
let streamingMessageId: string | null = null

const scheduleFlush =
  typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? (fn: () => void) => window.requestAnimationFrame(fn)
    : (fn: () => void) => window.setTimeout(fn, 16)

function flushDelta() {
  flushHandle = null
  if (!pendingDelta || !streamingMessageId) {
    pendingDelta = ''
    return
  }
  const text = pendingDelta
  pendingDelta = ''
  const id = streamingMessageId
  setState((prev) => ({
    messages: prev.messages.map((m) => (m.id === id ? { ...m, content: m.content + text } : m)),
  }))
}

function pushDelta(text: string) {
  pendingDelta += text
  if (flushHandle == null) flushHandle = scheduleFlush(flushDelta)
}

let refreshTimer: number | null = null

/** Coalesce sidebar refreshes so a fast stream never storms the API. */
function scheduleConversationRefresh() {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null
    void refreshConversations()
  }, 350)
}

function upsertConversation(conversation: Conversation) {
  setState((prev) => {
    const exists = prev.conversations.some((c) => c.id === conversation.id)
    const next = exists
      ? prev.conversations.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c))
      : [conversation, ...prev.conversations]
    return { conversations: next }
  })
}

export const isStreaming = () => Boolean(state.streaming)

export function stopGeneration() {
  if (!streamController) return
  streamController.abort()
  setState({ stopping: true })
}

interface RunOptions {
  request: ChatRequest
  optimisticUser?: { content: string; attachments: PendingAttachment[] }
  onBeforeStream?: () => void
}

/** One request/response cycle with the server, including all live updates. */
async function runStream({ request, optimisticUser }: RunOptions): Promise<void> {
  if (state.streaming) return
  const controller = new AbortController()
  streamController = controller
  let tempId: string | null = null

  if (optimisticUser) {
    tempId = uid()
    const optimistic: ChatMessage = {
      id: tempId,
      conversationId: request.conversationId ?? 'pending',
      role: 'user',
      content: optimisticUser.content,
      mode: (request.mode as ModeId) ?? state.mode,
      status: 'complete',
      sources: [],
      attachments: optimisticUser.attachments as Attachment[],
      position: Number.MAX_SAFE_INTEGER,
      createdAt: new Date().toISOString(),
    }
    setState((prev) => ({ messages: [...prev.messages, optimistic], draft: '' }))
    writeDraft(state.activeConversationId, '')
    setState({ pendingAttachments: [] })
  }

  setState({
    streaming: {
      conversationId: request.conversationId ?? '',
      assistantMessageId: null,
      phase: 'thinking',
      searchStatus: null,
      startedAt: Date.now(),
      action: request.action,
    },
    stopping: false,
  })

  const finish = () => {
    if (flushHandle != null) {
      if (typeof window !== 'undefined') window.cancelAnimationFrame?.(flushHandle)
      flushHandle = null
    }
    pendingDelta = ''
    streamingMessageId = null
    streamController = null
    setState({ streaming: null, stopping: false })
  }

  await streamChat(
    request,
    {
      onOpen: (data) => {
        const isNew = data.conversationId !== state.activeConversationId
        const replaced = data.replacedIds ?? []
        setState((prev) => ({
          activeConversationId: data.conversationId,
          conversation:
            prev.conversation?.id === data.conversationId ? prev.conversation : prev.conversation,
          messages: prev.messages
            .filter((m) => !replaced.includes(m.id))
            .map((m) =>
              m.id === tempId
                ? { ...m, id: data.messageId ?? m.id, conversationId: data.conversationId }
                : m,
            ),
          mode: (data.mode as ModeId) ?? prev.mode,
          streaming: prev.streaming ? { ...prev.streaming, conversationId: data.conversationId } : prev.streaming,
        }))
        if (isNew) {
          void refreshConversations()
          if (request.projectId) {
            setState((prev) => ({ activeProjectId: request.projectId ?? prev.activeProjectId }))
          }
        }
      },

      onTitle: (data) => {
        setState((prev) => ({
          conversations: prev.conversations.map((c) => (c.id === data.conversationId ? { ...c, title: data.title } : c)),
          conversation: prev.conversation?.id === data.conversationId ? { ...prev.conversation, title: data.title } : prev.conversation,
        }))
        writeDraft(data.conversationId, readDraft(data.conversationId))
      },

      onMeta: (data) => {
        streamingMessageId = data.assistantMessageId
        setState((prev) => {
          const index = prev.messages.findIndex((m) => m.id === data.assistantMessageId)
          const existing = index >= 0 ? prev.messages[index] : null
          const placeholder: ChatMessage = {
            id: data.assistantMessageId,
            conversationId: data.conversationId,
            role: 'assistant',
            content: '',
            mode: (data.mode as ModeId) ?? state.mode,
            status: data.notice ? 'notice' : 'streaming',
            sources: [],
            attachments: [],
            position: Number.MAX_SAFE_INTEGER - 1,
            createdAt: new Date().toISOString(),
            streaming: true,
          }
          // "continue" reuses the existing message, so keep what is already there.
          const next: ChatMessage = existing
            ? {
                ...existing,
                status: data.notice ? 'notice' : 'streaming',
                streaming: true,
              }
            : placeholder
          const withoutTarget = prev.messages.filter((m) => m.id !== data.assistantMessageId)
          const messages =
            index >= 0
              ? [...withoutTarget.slice(0, index), next, ...withoutTarget.slice(index)]
              : [...withoutTarget, next]
          return {
            messages,
            streaming: prev.streaming
              ? { ...prev.streaming, assistantMessageId: data.assistantMessageId, phase: 'streaming' }
              : prev.streaming,
          }
        })
        autoScrollSoon()
      },

      onDelta: ({ text }) => {
        setState((prev) =>
          prev.streaming ? { streaming: { ...prev.streaming, phase: 'streaming' } } : {},
        )
        pushDelta(text)
        autoScrollSoon()
      },

      onSearch: (data) => {
        setState((prev) =>
          prev.streaming
            ? {
                streaming: {
                  ...prev.streaming,
                  phase: data.status === 'running' ? 'searching' : 'streaming',
                  searchStatus: data.status,
                },
              }
            : {},
        )
      },

      onDone: (data) => {
        if (flushHandle != null) {
          if (typeof window !== 'undefined') window.cancelAnimationFrame?.(flushHandle)
          flushHandle = null
        }
        pendingDelta = ''
        streamingMessageId = null
        setState((prev) => ({
          messages: prev.messages.map((m) =>
            m.id === data.message.id
              ? { ...data.message, streaming: false, error: null }
              : m.streaming
                ? { ...m, streaming: false }
                : m,
          ),
        }))
        if (data.conversation) upsertConversation(data.conversation)
        scheduleConversationRefresh()
      },

      onTruncated: (data) => {
        setState({
          messages: data.messages,
          activeConversationId: data.conversationId,
          editingMessageId: null,
        })
      },

      onError: (data) => {
        if (data.aborted) {
          setState((prev) => ({
            messages: prev.messages.map((m) =>
              m.id === data.assistantMessageId && m.role === 'assistant'
                ? { ...m, status: m.content ? 'stopped' : m.status, streaming: false }
                : m.streaming
                  ? { ...m, streaming: false }
                  : m,
            ),
            stopping: false,
          }))
          return
        }const messageId = data.assistantMessageId ?? streamingMessageId
        setState((prev) => {
          // When generation never started (rate limit, offline, bad request)
          // the failure belongs to the user's message so they can retry it.
          const fallbackId =
            messageId ??
            [...prev.messages].reverse().find((m) => m.role === 'user' && !m.error)?.id ??
            null
          return {
            messages: prev.messages
              .filter((m) => !(m.role === 'assistant' && m.streaming && !m.content && m.id !== messageId))
              .map((m) =>
                m.id === fallbackId
                  ? {
                      ...m,
                      streaming: false,
                      status: m.role === 'assistant' ? 'error' : m.status,
                      error: { message: data.message, code: data.code, retryable: data.retryable },
                    }
                  : m,
              ),
          }
        })
        toast('error', data.message)
      },
    },
    controller.signal,
  )

  finish()
}

/** Keeps the newest content in view while it streams, without fighting the user. */
let scrollRequest = 0
export function autoScrollSoon() {
  scrollRequest += 1
  const token = scrollRequest
  window.requestAnimationFrame?.(() => {
    if (token !== scrollRequest) return
    window.dispatchEvent(new CustomEvent('pucho:scroll'))
  })
}

/* ------------------------------ chat actions --------------------------- */

export function sendMessage(content?: string) {
  const text = (content ?? state.draft).trim()
  const attachments = state.pendingAttachments.filter((a) => !a.pending && a.id)
  if (!text && !attachments.length) return
  if (state.streaming) return
  if (state.uploading > 0) {
    toast('warning', 'Still finishing an upload — one moment.')
    return
  }

  if (state.status && !state.status.provider.configured) {
    toast(
      'error',
      "PUCHO isn't connected to a model yet. Add the provider API key to .env and restart the server.",
    )
  }

  void runStream({
    request: {
      action: 'send',
      conversationId: state.activeConversationId,
      projectId: state.activeProjectId,
      mode: state.mode,
      content: text,
      attachmentIds: attachments.map((a) => a.id),
      useSearch: true,
    },
    optimisticUser: { content: text, attachments },
  })
}

export function regenerate(messageId: string) {
  if (state.streaming) return
  void runStream({
    request: {
      action: 'regenerate',
      conversationId: state.activeConversationId,
      projectId: state.activeProjectId,
      messageId,
    },
  })
}

export function continueMessage(messageId: string) {
  if (state.streaming) return
  void runStream({
    request: { action: 'continue', conversationId: state.activeConversationId, messageId },
  })
}

/** Re-ask after a failed turn, replacing it in place. */
export async function retryMessage(message: ChatMessage) {
  if (state.streaming) return
  const content = message.content.trim()
  if (!content) return

  // A turn that never reached the server has no persisted id to truncate, so
  // drop the local bubble instead of asking the server about it.
  if (message.id.startsWith('local_')) {
    setState((prev) => ({ messages: prev.messages.filter((m) => m.id !== message.id) }))
  } else {
    await runStream({
      request: { action: 'truncate', conversationId: message.conversationId, messageId: message.id },
    })
  }
  void runStream({
    request: {
      action: 'send',
      conversationId: message.conversationId,
      projectId: state.activeProjectId,
      mode: state.mode,
      content,
      attachmentIds: (message.attachments ?? []).map((a) => a.id),
    },
    optimisticUser: { content, attachments: (message.attachments ?? []) as never[] },
  })
}

export function setEditingMessage(id: string | null) {
  setState({ editingMessageId: id })
}

export async function editUserMessage(messageId: string, content: string) {
  const text = content.trim()
  if (!text || state.streaming) return
  const message = state.messages.find((m) => m.id === messageId)
  setState({
    editingMessageId: null,
    messages: state.messages.map((m) => (m.id === messageId ? { ...m, content: text } : m)),
  })
  // Drop this turn and everything after it, then ask again with the new text.
  await runStream({
    request: { action: 'truncate', conversationId: state.activeConversationId, messageId },
  })
  if (message?.attachments?.length) {
    toast('info', 'Attachments from the previous version of this message were removed.')
  }
  void runStream({
    request: {
      action: 'send',
      conversationId: state.activeConversationId,
      projectId: state.activeProjectId,
      mode: state.mode,
      content: text,
      attachmentIds: message?.attachments?.map((a) => a.id) ?? [],
    },
    optimisticUser: { content: text, attachments: [] },
  })
}

/* --------------------------------- boot -------------------------------- */

export async function bootstrap() {
  applyTheme((safeStorage.get(THEME_KEY) as Settings['theme'] | null) ?? DEFAULT_SETTINGS.theme)
  try {
    const [{ settings }, status, { conversations }, { projects }] = await Promise.all([
      api.settings(),
      api.status().catch(() => null),
      api.listConversations().catch(() => ({ conversations: [] })),
      api.listProjects().catch(() => ({ projects: [] })),
    ])
    applyTheme(settings.theme)
    applyMotion(settings.reducedMotion)
    setState({
      settings,
      status,
      conversations,
      projects,
      ready: true,
      mode: settings.defaultMode,
      draft: readDraft(null),
      bootError: status ? null : 'PUCHO cannot reach the server right now.',
    })
    if (status && !status.provider.configured) {
      toast('warning', 'PUCHO is running without a provider API key. Add the key to .env to chat.')
    }
  } catch (err) {
    setState({ ready: true, bootError: errorMessage(err, 'PUCHO could not start.') })
  }
}

export function dict() {
  return dictFor(state.settings.language as Lang)
}