import { Archive, Menu, Pencil, Settings as SettingsIcon, Trash2 } from 'lucide-react'

import ModePicker from './ModePicker'
import {
  deleteActiveChat,
  dict,
  requestRename,
  setState,
  toggleArchive,
  usePucho,
} from '../lib/store'

export default function TopBar() {
  const state = usePucho()
  const t = dict()
  // A chat started in this session lives in the list before it is reopened,
  // so fall back to the list entry to keep the title in sync.
  const conversation =
    state.conversation ??
    state.conversations.find((c) => c.id === state.activeConversationId) ??
    null
  const mode = state.status?.modes.find((m) => m.id === state.mode)
  const project = state.projects.find((p) => p.id === state.activeProjectId)

  const title =
    state.view === 'settings'
      ? t.settingsTitle
      : state.view === 'projects'
        ? t.projects
        : conversation?.title || t.untitled

  const subtitle = [
    mode ? `${mode.icon} ${mode.label}` : null,
    project?.name ?? null,
    state.messages.length ? `${state.messages.length} messages` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn menu-btn"
        onClick={() => setState({ sidebarOpen: true })}
        aria-label="Open sidebar"
        aria-controls="pucho-sidebar"
        aria-expanded={state.sidebarOpen}
      >
        <Menu size={18} />
      </button>

      <div style={{ minWidth: 0 }}>
        <div className="topbar__title">{title}</div>
        {subtitle && <div className="topbar__sub">{subtitle}</div>}
      </div>

      <div className="topbar__spacer" />

      <div className="topbar__actions">
        {state.view === 'chat' && <ModePicker />}

        {conversation && state.view === 'chat' && (
          <>
            <button
              type="button"
              className="icon-btn"
              onClick={() => requestRename(conversation)}
              title="Rename chat"
              aria-label="Rename chat"
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => void toggleArchive(conversation)}
              title="Archive chat"
              aria-label="Archive chat"
            >
              <Archive size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={deleteActiveChat}
              title="Delete chat"
              aria-label="Delete chat"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}

        <button
          type="button"
          className="icon-btn topbar__settings"
          onClick={() => setState({ view: 'settings', sidebarOpen: false })}
          title={t.settings}
          aria-label={t.settings}
        >
          <SettingsIcon size={16} />
        </button>
      </div>
    </header>
  )
}