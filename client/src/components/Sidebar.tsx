import { memo, useMemo, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  Folder,
  MessageSquare,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Settings as SettingsIcon,
  Trash2,
  X,
} from 'lucide-react'

import Logo from './Logo'
import { groupLabel, relativeTime } from '../lib/format'
import type { Lang } from '../lib/i18n'
import {
  deleteConversation,
  dict,
  newChat,
  openConversation,
  refreshArchived,
  requestConfirm,
  requestRename,
  runSearch,
  setMode,
  setSearchOpen,
  setState,
  setActiveProject,
  toggleArchive,
  usePucho,
  type ViewId,
} from '../lib/store'
import type { Conversation } from '../lib/types'

const ChatRow = memo(function ChatRow({
  conversation,
  active,
  lang,
  untitled,
  onOpen,
  onRename,
  onArchive,
  onDelete,
}: {
  conversation: Conversation
  active: boolean
  lang: Lang
  untitled: string
  onOpen: () => void
  onRename: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const title = conversation.title || untitled
  return (
    <div className={`chat-item${active ? ' chat-item--active' : ''}`}>
      <button
        type="button"
        onClick={onOpen}
        className="chat-item__open"
        title={title}
      >
        <MessageSquare size={14} style={{ flex: 'none', opacity: 0.7 }} aria-hidden="true" />
        <span className="chat-item__body">
          <span className="chat-item__title">{title}</span>
          <span className="chat-item__meta">
            <span>{relativeTime(conversation.updatedAt, lang)}</span>
            {conversation.projectName && <span>· {conversation.projectName}</span>}
          </span>
        </span>
      </button>
      <span className="chat-item__actions">
        <button
          type="button"
          className="chat-item__btn"
          onClick={onRename}
          title="Rename"
          aria-label={`Rename ${title}`}
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          className="chat-item__btn"
          onClick={onArchive}
          title={conversation.archived ? 'Unarchive' : 'Archive'}
          aria-label={conversation.archived ? 'Unarchive chat' : 'Archive chat'}
        >
          {conversation.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
        </button>
        <button
          type="button"
          className="chat-item__btn chat-item__btn--danger"
          onClick={onDelete}
          title="Delete"
          aria-label={`Delete ${title}`}
        >
          <Trash2 size={13} />
        </button>
      </span>
    </div>
  )
})

export default function Sidebar() {
  const state = usePucho()
  const t = dict()
  const lang = state.settings.language
  const [filter, setFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    const list = showArchived ? state.archived : state.conversations
    if (!query) return list
    return list.filter(
      (c) =>
        c.title.toLowerCase().includes(query) || (c.preview ?? '').toLowerCase().includes(query),
    )
  }, [filter, showArchived, state.archived, state.conversations])

  const grouped = useMemo(() => {
    const groups = new Map<string, Conversation[]>()
    for (const conversation of filtered) {
      const key = groupLabel(conversation.updatedAt, lang)
      const bucket = groups.get(key) ?? []
      bucket.push(conversation)
      groups.set(key, bucket)
    }
    return [...groups.entries()]
  }, [filtered, lang])

  const goto = (view: ViewId) => setState({ view, sidebarOpen: false })

  const confirmDelete = (conversation: Conversation) => {
    requestConfirm({
      title: t.deleteChat,
      message: t.deleteChatBody,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
      onConfirm: () => deleteConversation(conversation.id),
    })
  }

  const openProject = (projectId: string) => {
    setActiveProject(projectId)
    newChat()
  }

  return (
    <aside
      className={`sidebar${state.sidebarOpen ? ' sidebar--open' : ''}`}
      aria-label="Chat sidebar"
      id="pucho-sidebar"
    >
      <div className="sidebar__head">
        <button type="button" className="brand" onClick={() => newChat()} aria-label="PUCHO, new chat">
          <Logo />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--ghost sidebar__close"
          onClick={() => setState({ sidebarOpen: false })}
          aria-label="Close sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="sidebar__scroll scroll">
        <button type="button" className="btn-new" onClick={() => newChat()}>
          <Plus size={16} />
          <span>{t.newChat}</span>
          <span className="btn-new__cmd kbd">⌘N</span>
        </button>

        <div className="search-field">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={filter}
            placeholder={t.search}
            aria-label={t.search}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void runSearch(filter)
                setSearchOpen(true)
              }
            }}
          />
          {filter && (
            <button
              type="button"
              className="search-field__clear"
              onClick={() => setFilter('')}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {state.status && (
          <div className="status-line">
            <span className={`status-dot${state.status.provider.configured ? '' : ' status-dot--off'}`} />
            <span>
              {state.status.provider.configured
                ? `${state.status.modes.find((m) => m.id === state.mode)?.model ?? 'ready'}`
                : 'Add the provider API key to .env to connect'}
            </span>
          </div>
        )}

        <nav className="nav-group" aria-label={t.projects}>
          <div className="nav-group__label">
            <span>{t.projects}</span>
            <button
              type="button"
              className="nav-group__action"
              onClick={() => goto('projects')}
              aria-label="Manage projects"
            >
              {t.newProject}
            </button>
          </div>
          {state.projects.length === 0 ? (
            <p className="empty-note">{t.noProjects}</p>
          ) : (
            state.projects.slice(0, 8).map((project) => (
              <button
                key={project.id}
                type="button"
                className={`nav-item${state.activeProjectId === project.id ? ' nav-item--active' : ''}`}
                onClick={() => openProject(project.id)}
                title={project.name}
              >
                <Folder size={15} aria-hidden="true" />
                <span className="truncate">{project.name}</span>
                <span className="nav-item__count">{project.conversationCount ?? 0}</span>
              </button>
            ))
          )}
        </nav>

        <nav className="nav-group" aria-label={showArchived ? t.archived : t.recent}>
          <div className="nav-group__label">
            <span>{showArchived ? t.archived : t.recent}</span>
            <button
              type="button"
              className="nav-group__action"
              onClick={() => {
                const next = !showArchived
                setShowArchived(next)
                if (next && !state.archivedLoaded) void refreshArchived()
                setFilter('')
              }}
            >
              {showArchived ? t.recent : t.saved}
            </button>
          </div>

          {grouped.length === 0 ? (
            <p className="empty-note">
              {showArchived ? 'Nothing archived.' : `${t.noChats} ${t.noChatsHint}`}
            </p>
          ) : (
            grouped.map(([label, items]) => (
              <div key={label} style={{ marginBottom: 6 }}>
                <div className="nav-group__label nav-group__label--plain">{label}</div>
                {items.map((conversation) => (
                  <ChatRow
                    key={conversation.id}
                    conversation={conversation}
                    active={!showArchived && state.activeConversationId === conversation.id}
                    lang={lang}
                    untitled={t.untitled}
                    onOpen={() => {
                      void openConversation(conversation.id)
                      setMode(conversation.mode)
                      setActiveProject(conversation.projectId)
                    }}
                    onRename={() => requestRename(conversation)}
                    onArchive={() => void toggleArchive(conversation)}
                    onDelete={() => confirmDelete(conversation)}
                  />
                ))}
              </div>
            ))
          )}
        </nav>
      </div>

      <div className="sidebar__foot">
        <button
          type="button"
          className={`nav-item${state.view === 'settings' ? ' nav-item--active' : ''}`}
          onClick={() => goto('settings')}
        >
          <SettingsIcon size={15} aria-hidden="true" />
          <span>{t.settings}</span>
        </button>
        <button
          type="button"
          className={`nav-item${state.view === 'projects' ? ' nav-item--active' : ''}`}
          onClick={() => goto('projects')}
        >
          <Folder size={15} aria-hidden="true" />
          <span>{t.projects}</span>
        </button>
      </div>
    </aside>
  )
}