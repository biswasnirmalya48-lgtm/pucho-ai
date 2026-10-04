import { useState } from 'react'
import { ArrowLeft, Folder, MessageSquare, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'

import FileCard from './FileCard'
import {
  createProject,
  deleteProject,
  dict,
  newChat,
  openConversation,
  refreshProjects,
  setActiveProject,
  updateProject,
  usePucho,
} from '../lib/store'
import { api } from '../lib/api'
import type { Project } from '../lib/types'

interface Draft {
  id: string | null
  name: string
  description: string
  instructions: string
  context: string
}

const emptyDraft: Draft = { id: null, name: '', description: '', instructions: '', context: '' }

export default function ProjectsView() {
  const state = usePucho()
  const t = dict()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [files, setFiles] = useState<{ id: string; name: string; kind: string; size: number; textChars: number; warning: string | null }[]>([])
  const [chats, setChats] = useState<{ id: string; title: string; updatedAt: string }[]>([])
  const [busy, setBusy] = useState(false)

  const detail = state.projects.find((p) => p.id === detailId) ?? null

  const openDetail = async (project: Project) => {
    setDetailId(project.id)
    try {
      const data = await api.getProject(project.id)
      setFiles(data.files as never)
      setChats(data.conversations as never)
    } catch {
      setFiles([])
      setChats([])
    }
  }

  const submitDraft = async () => {
    if (!draft || !draft.name.trim()) return
    setBusy(true)
    if (draft.id) {
      await updateProject(draft.id, {
        name: draft.name.trim(),
        description: draft.description,
        instructions: draft.instructions,
        context: draft.context,
      })
    } else {
      const created = await createProject({
        name: draft.name.trim(),
        description: draft.description,
        instructions: draft.instructions,
        context: draft.context,
      })
      if (created) await openDetail(created)
    }
    setBusy(false)
    setDraft(null)
  }

  const uploadProjectFiles = async (list: FileList | null) => {
    if (!list?.length || !detail) return
    setBusy(true)
    try {
      await api.uploadFiles(Array.from(list), { projectId: detail.id })
      await refreshProjects()
      const data = await api.getProject(detail.id)
      setFiles(data.files as never)
    } finally {
      setBusy(false)
    }
  }

  if (draft) {
    return (
      <div className="view scroll">
        <div className="view__inner">
          <h1 className="view__title">{draft.id ? t.settings : t.newProject}</h1>
          <p className="view__sub">
            Give PUCHO the instructions and context it should use whenever you chat inside this project.
          </p>

          <div className="settings">
            <div className="field">
              <label className="field__label" htmlFor="project-name">
                {t.projectName}
              </label>
              <input
                id="project-name"
                className="input"
                value={draft.name}
                autoFocus
                placeholder="VOCON"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="project-desc">
                Short description
              </label>
              <input
                id="project-desc"
                className="input"
                value={draft.description}
                placeholder="What is this project about?"
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="project-instructions">
                {t.projectInstructions}
              </label>
              <textarea
                id="project-instructions"
                className="textarea"
                value={draft.instructions}
                placeholder="Always answer in British English. Prefer short paragraphs. Never invent certifications."
                onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
              />
              <span className="field__hint">Sent to the model with every message in this project.</span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="project-context">
                {t.projectContext}
              </label>
              <textarea
                id="project-context"
                className="textarea"
                value={draft.context}
                placeholder="Background, decisions, links, key numbers…"
                onChange={(event) => setDraft({ ...draft, context: event.target.value })}
              />
            </div>

            <div className="row" style={{ borderBottom: 'none' }}>
              <button type="button" className="btn" onClick={() => setDraft(null)}>
                {t.cancel}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!draft.name.trim() || busy}
                onClick={() => void submitDraft()}
              >
                {t.save}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (detail) {
    return (
      <div className="view scroll">
        <div className="view__inner">
          <button type="button" className="btn btn--sm" onClick={() => setDetailId(null)}>
            <ArrowLeft size={13} /> {t.projects}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 6px' }}>
            <h1 className="view__title" style={{ margin: 0 }}>
              {detail.name}
            </h1>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() =>
                  setDraft({
                    id: detail.id,
                    name: detail.name,
                    description: detail.description,
                    instructions: detail.instructions,
                    context: detail.context,
                  })
                }
              >
                <Pencil size={13} /> Edit
              </button>
              <button
                type="button"
                className="btn btn--sm btn--danger"
                onClick={() => {
                  void deleteProject(detail.id)
                  setDetailId(null)
                }}
              >
                <Trash2 size={13} /> {t.delete}
              </button>
            </div>
          </div>
          <p className="view__sub">{detail.description || 'No description yet.'}</p>

          {detail.instructions && (
            <div className="card" style={{ marginBottom: 12 }}>
              <h3 className="card__title">{t.projectInstructions}</h3>
              <p className="card__desc" style={{ whiteSpace: 'pre-wrap' }}>
                {detail.instructions}
              </p>
            </div>
          )}
          {detail.context && (
            <div className="card" style={{ marginBottom: 12 }}>
              <h3 className="card__title">{t.projectContext}</h3>
              <p className="card__desc" style={{ whiteSpace: 'pre-wrap' }}>
                {detail.context}
              </p>
            </div>
          )}

          <div className="row" style={{ borderBottom: 'none' }}>
            <div className="row__text">
              <div className="row__label">Start a chat in this project</div>
              <div className="row__hint">PUCHO uses this project’s context automatically.</div>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => {
                setActiveProject(detail.id)
                newChat()
              }}
            >
              <Plus size={13} /> {t.newChat}
            </button>
          </div>

          <h2 className="section-title">
            {t.files} ({files.length})
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {files.map((file) => (
              <div key={file.id} style={{ position: 'relative' }}>
                <FileCard file={file as never} />
                <button
                  type="button"
                  className="file-card__remove"
                  style={{ position: 'absolute', top: 4, right: 4 }}
                  aria-label={`Delete ${file.name}`}
                  onClick={async () => {
                    await api.deleteFile(file.id)
                    const data = await api.getProject(detail.id)
                    setFiles(data.files as never)
                    await refreshProjects()
                  }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            {files.length === 0 && <p className="field__hint">No project files yet.</p>}
          </div>

          <label className="btn btn--sm" style={{ cursor: 'pointer' }}>
            <Paperclip size={13} /> {busy ? 'Uploading…' : 'Add files'}
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => {
                void uploadProjectFiles(event.target.files)
                event.target.value = ''
              }}
            />
          </label>

          <h2 className="section-title">
            Chats ({chats.length})
          </h2>
          {chats.length === 0 ? (
            <p className="field__hint">No chats in this project yet.</p>
          ) : (
            <div className="results">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  className="result"
                  onClick={() => void openConversation(chat.id)}
                >
                  <span className="result__title">
                    <MessageSquare size={13} style={{ verticalAlign: '-2px', marginRight: 6, opacity: 0.6 }} />
                    {chat.title || t.untitled}
                  </span>
                  <span className="result__meta">{new Date(chat.updatedAt).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="view scroll">
      <div className="view__inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <h1 className="view__title">{t.projects}</h1>
            <p className="view__sub">{t.noProjectsHint}</p>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            style={{ marginLeft: 'auto' }}
            onClick={() => setDraft({ ...emptyDraft })}
          >
            <Plus size={15} /> {t.newProject}
          </button>
        </div>

        {state.projects.length === 0 ? (
          <p className="field__hint" style={{ marginTop: 30 }}>
            {t.noProjectsHint}
          </p>
        ) : (
          <div className="grid">
            {state.projects.map((project) => (
              <article key={project.id} className="card">
                <div className="card__actions">
                  <button
                    type="button"
                    className="chat-item__btn"
                    aria-label={`Edit ${project.name}`}
                    onClick={() =>
                      setDraft({
                        id: project.id,
                        name: project.name,
                        description: project.description,
                        instructions: project.instructions,
                        context: project.context,
                      })
                    }
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    className="chat-item__btn chat-item__btn--danger"
                    aria-label={`Delete ${project.name}`}
                    onClick={() => {
                      void deleteProject(project.id)
                      if (detailId === project.id) setDetailId(null)
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <h3 className="card__title">
                  <span className="card__dot" aria-hidden="true" />
                  {project.name}
                </h3>
                <p className="card__desc">{project.description || 'No description yet.'}</p>
                <div className="card__meta">
                  <span>
                    <MessageSquare size={11} /> {project.conversationCount ?? 0} chats
                  </span>
                  <span>
                    <Paperclip size={11} /> {project.fileCount ?? 0} files
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    onClick={() => {
                      setActiveProject(project.id)
                      newChat()
                    }}
                  >
                    <Plus size={13} /> {t.newChat}
                  </button>
                  <button type="button" className="btn btn--sm" onClick={() => void openDetail(project)}>
                    <Folder size={13} /> Open
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {state.projects.length > 0 && (
          <p className="field__hint" style={{ marginTop: 18 }}>
            {state.projects.reduce((sum, p) => sum + (p.fileCount ?? 0), 0)} files stored across these
            projects.
          </p>
        )}
      </div>
    </div>
  )
}