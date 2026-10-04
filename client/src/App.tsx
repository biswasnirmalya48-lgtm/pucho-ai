import { useEffect } from 'react'
import { usePucho, bootstrap, newChat, setSearchOpen, resolveConfirm, cancelRename, setState } from './lib/store'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Thread from './components/Thread'
import Composer from './components/Composer'
import ProjectsView from './components/ProjectsView'
import SettingsView from './components/SettingsView'
import SearchDialog from './components/SearchDialog'
import ConfirmDialog from './components/ConfirmDialog'
import RenameDialog from './components/RenameDialog'
import Toasts from './components/Toasts'
import { Mark } from './components/Logo'

function Boot() {
  return (
    <div className="boot">
      <div className="boot__mark">P</div>
      <p style={{ margin: 0, fontSize: 14 }}>Starting PUCHO…</p>
    </div>
  )
}

export default function App() {
  const state = usePucho()

  useEffect(() => {
    void bootstrap()
  }, [])

  // Keep the OS light/dark preference in sync when the theme is "system".
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => {
      if (state.settings.theme === 'system') {
        document.documentElement.dataset.theme = media.matches ? 'light' : 'dark'
      }
    }
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [state.settings.theme])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable === true

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        newChat()
        return
      }
      if (event.key === 'Escape') {
        if (state.confirm) resolveConfirm(false)
        else if (state.renameTarget) cancelRename()
        else if (state.searchOpen) setSearchOpen(false)
        else if (state.sidebarOpen) setState({ sidebarOpen: false })
        else if (typing && target instanceof HTMLTextAreaElement) target.blur()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state.confirm, state.renameTarget, state.searchOpen, state.sidebarOpen])

  if (!state.ready) return <Boot />

  return (
    <div className="app">
      <Sidebar />
      {state.sidebarOpen && (
        <div
          className="backdrop"
          onClick={() => setState({ sidebarOpen: false })}
          aria-hidden="true"
        />
      )}

      <main className="main">
        <TopBar />

        {state.view === 'chat' && (
          <>
            <Thread
              speechEnabled={state.settings.readAloud}
              userInitial={(state.settings.name || 'You').trim().charAt(0).toUpperCase() || 'Y'}
            />
            <Composer />
          </>
        )}
        {state.view === 'projects' && <ProjectsView />}
        {state.view === 'settings' && <SettingsView />}
      </main>

      {state.searchOpen && <SearchDialog />}
      {state.confirm && <ConfirmDialog />}
      {state.renameTarget && <RenameDialog />}
      <Toasts />

      {state.bootError && !state.status && (
        <div className="toasts">
          <div className="toast toast--error">
            <Mark size={12} />
            <span>{state.bootError}</span>
          </div>
        </div>
      )}
    </div>
  )
}