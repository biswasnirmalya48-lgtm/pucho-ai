/**
 * SQLite persistence for PUCHO (node:sqlite, no native build step).
 *
 * Conversations, messages, projects, uploads and settings all live here so the
 * browser never has to hold the whole history and multi-tab usage stays sane.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { DB_PATH, ensureDirs, LIMITS, DEFAULT_MODE } from './config.js'

let db = null

export const newId = () => randomUUID()
export const nowIso = () => new Date().toISOString()

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL DEFAULT '',
  mode         TEXT NOT NULL DEFAULT '${DEFAULT_MODE}',
  project_id   TEXT,
  archived     INTEGER NOT NULL DEFAULT 0,
  pinned       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  mode            TEXT,
  status          TEXT NOT NULL DEFAULT 'complete',
  sources         TEXT,
  attachments     TEXT,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  instructions  TEXT NOT NULL DEFAULT '',
  context       TEXT NOT NULL DEFAULT '',
  accent        TEXT NOT NULL DEFAULT 'violet',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  size            INTEGER NOT NULL DEFAULT 0,
  mime            TEXT NOT NULL DEFAULT '',
  kind            TEXT NOT NULL DEFAULT 'file',
  stored_path     TEXT NOT NULL,
  text            TEXT NOT NULL DEFAULT '',
  truncated       INTEGER NOT NULL DEFAULT 0,
  page_count      INTEGER,
  warning         TEXT,
  conversation_id TEXT,
  message_id      TEXT,
  project_id      TEXT,
  created_at      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, position);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_files_conversation ON files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
`

export function getDb() {
  if (db) return db
  ensureDirs()
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  db = new DatabaseSync(DB_PATH)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(SCHEMA)
  return db
}

const parseJson = (value, fallback) => {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function mapConversation(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    projectId: row.project_id,
    archived: !!row.archived,
    pinned: !!row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count ?? undefined,
    preview: row.preview ?? undefined,
    projectName: row.project_name ?? undefined,
  }
}

export function mapMessage(row) {
  if (!row) return null
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    mode: row.mode,
    status: row.status,
    sources: parseJson(row.sources, []),
    attachments: parseJson(row.attachments, []),
    position: row.position,
    createdAt: row.created_at,
  }
}

export function mapProject(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    context: row.context,
    accent: row.accent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    conversationCount: row.conversation_count ?? undefined,
    fileCount: row.file_count ?? undefined,
  }
}

export function mapFile(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    size: row.size,
    mime: row.mime,
    kind: row.kind,
    textChars: (row.text || '').length,
    truncated: !!row.truncated,
    pageCount: row.page_count ?? undefined,
    warning: row.warning || null,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    projectId: row.project_id,
    createdAt: row.created_at,
    url: `/api/files/${row.id}/raw`,
    textUrl: `/api/files/${row.id}/text`,
  }
}

/* ----------------------------- conversations ---------------------------- */

export const conversations = {
  create({ title = '', mode = DEFAULT_MODE, projectId = null, id } = {}) {
    const conn = getDb()
    const now = nowIso()
    const convId = id || newId()
    conn
      .prepare(
        `INSERT INTO conversations (id, title, mode, project_id, archived, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
      )
      .run(convId, title, mode, projectId, now, now)
    return this.get(convId)
  },

  get(id) {
    if (!id) return null
    return mapConversation(getDb().prepare(`SELECT * FROM conversations WHERE id = ?`).get(id))
  },

  exists(id) {
    if (!id) return false
    return !!getDb().prepare(`SELECT 1 AS ok FROM conversations WHERE id = ?`).get(id)
  },

  list({ query = '', archived = false, projectId = null, limit = 300, offset = 0 } = {}) {
    const where = ['archived = ?']
    const params = [archived ? 1 : 0]
    if (projectId) {
      where.push('project_id = ?')
      params.push(projectId)
    }
    if (query.trim()) {
      where.push('(title LIKE ? COLLATE NOCASE OR id IN (SELECT conversation_id FROM messages WHERE content LIKE ? COLLATE NOCASE))')
      params.push(`%${query.trim()}%`, `%${query.trim()}%`)
    }
    params.push(limit, offset)
    const rows = getDb()
      .prepare(
        `SELECT c.*,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
                (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.position DESC LIMIT 1) AS preview,
                (SELECT p.name FROM projects p WHERE p.id = c.project_id) AS project_name
         FROM conversations c
         WHERE ${where.join(' AND ')}
         ORDER BY c.pinned DESC, c.updated_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params)
    return rows.map(mapConversation)
  },

  count({ archived = false } = {}) {
    const row = getDb()
      .prepare(`SELECT COUNT(*) AS n FROM conversations WHERE archived = ?`)
      .get(archived ? 1 : 0)
    return row?.n ?? 0
  },

  update(id, patch = {}) {
    const current = this.get(id)
    if (!current) return null
    const fields = []
    const params = []
    const set = (col, value) => {
      fields.push(`${col} = ?`)
      params.push(value)
    }
    if (patch.title !== undefined) set('title', String(patch.title).slice(0, LIMITS.conversationTitle))
    if (patch.mode !== undefined) set('mode', patch.mode)
    if (patch.archived !== undefined) set('archived', patch.archived ? 1 : 0)
    if (patch.pinned !== undefined) set('pinned', patch.pinned ? 1 : 0)
    if (patch.projectId !== undefined) set('project_id', patch.projectId || null)
    if (patch.touch !== false) set('updated_at', nowIso())
    if (!fields.length) return current
    params.push(id)
    getDb().prepare(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    return this.get(id)
  },

  touch(id) {
    getDb().prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(nowIso(), id)
  },

  /** Deleting a conversation also removes its messages and stored files. */
  remove(id) {
    const conn = getDb()
    const files = conn.prepare(`SELECT * FROM files WHERE conversation_id = ?`).all(id)
    conn.prepare(`DELETE FROM conversations WHERE id = ?`).run(id)
    for (const row of files) {
      conn.prepare(`DELETE FROM files WHERE id = ?`).run(row.id)
      try {
        fs.rmSync(row.stored_path, { force: true })
      } catch {
        /* file already gone — nothing to clean up */
      }
    }
    return { files: files.map((f) => f.stored_path) }
  },
}

/* -------------------------------- messages ------------------------------ */

export const messages = {
  add({ conversationId, role, content = '', mode = null, status = 'complete', sources = [], attachments = [], id } = {}) {
    const conn = getDb()
    const msgId = id || newId()
    const next = conn
      .prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM messages WHERE conversation_id = ?`)
      .get(conversationId).next
    conn
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, mode, status, sources, attachments, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        msgId,
        conversationId,
        role,
        content,
        mode,
        status,
        JSON.stringify(sources ?? []),
        JSON.stringify(attachments ?? []),
        next,
        nowIso(),
      )
    conversations.touch(conversationId)
    return this.get(msgId)
  },

  get(id) {
    return mapMessage(getDb().prepare(`SELECT * FROM messages WHERE id = ?`).get(id))
  },

  listByConversation(conversationId, { limit = 500, before = null } = {}) {
    const params = [conversationId]
    let sql = `SELECT * FROM messages WHERE conversation_id = ?`
    if (before !== null && before !== undefined) {
      sql += ` AND position < ?`
      params.push(before)
    }
    sql += ` ORDER BY position DESC LIMIT ?`
    params.push(limit)
    const rows = getDb().prepare(sql).all(...params)
    return rows.reverse().map(mapMessage)
  },

  countByConversation(conversationId) {
    return getDb().prepare(`SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?`).get(conversationId).n
  },

  update(id, patch = {}) {
    const current = this.get(id)
    if (!current) return null
    const fields = []
    const params = []
    if (patch.content !== undefined) {
      fields.push('content = ?')
      params.push(patch.content)
    }
    if (patch.status !== undefined) {
      fields.push('status = ?')
      params.push(patch.status)
    }
    if (patch.sources !== undefined) {
      fields.push('sources = ?')
      params.push(JSON.stringify(patch.sources ?? []))
    }
    if (patch.attachments !== undefined) {
      fields.push('attachments = ?')
      params.push(JSON.stringify(patch.attachments ?? []))
    }
    if (!fields.length) return current
    params.push(id)
    getDb().prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    return this.get(id)
  },

  /** Delete a single message row (used to discard an empty failed turn). */
  remove(id) {
    const conn = getDb()
    conn.prepare(`UPDATE files SET message_id = NULL WHERE message_id = ?`).run(id)
    conn.prepare(`DELETE FROM messages WHERE id = ?`).run(id)
    return true
  },

  /** Delete a message and everything after it in that conversation. */
  removeFrom(id) {
    const conn = getDb()
    const msg = this.get(id)
    if (!msg) return null
    const removed = conn
      .prepare(`SELECT * FROM messages WHERE conversation_id = ? AND position >= ?`)
      .all(msg.conversationId, msg.position)
    conn
      .prepare(`DELETE FROM messages WHERE conversation_id = ? AND position >= ?`)
      .run(msg.conversationId, msg.position)
    for (const row of removed) {
      conn.prepare(`UPDATE files SET message_id = NULL WHERE message_id = ?`).run(row.id)
    }
    conversations.touch(msg.conversationId)
    return removed.map(mapMessage)
  },

  /** History for the model, newest-first slice, returned oldest-first. */
  historyFor(conversationId, { limit = LIMITS.historyMessages, maxChars = LIMITS.historyChars } = {}) {
    const rows = this.listByConversation(conversationId, { limit: limit + 4 })
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter((m) => (m.status === 'complete' || m.status === 'stopped') && m.content.trim())
      .slice(-limit)
    let total = 0
    const out = []
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i]
      total += row.content.length
      if (total > maxChars && out.length) break
      out.unshift({ role: row.role, content: row.content })
    }
    return out
  },
}

/* -------------------------------- projects ------------------------------ */

export const projects = {
  create({ name, description = '', instructions = '', context = '', accent = 'violet' } = {}) {
    const conn = getDb()
    const now = nowIso()
    const id = newId()
    conn
      .prepare(
        `INSERT INTO projects (id, name, description, instructions, context, accent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, name, description, instructions, context, accent, now, now)
    return this.get(id)
  },

  get(id) {
    if (!id) return null
    return mapProject(getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(id))
  },

  list() {
    return getDb()
      .prepare(
        `SELECT p.*,
                (SELECT COUNT(*) FROM conversations c WHERE c.project_id = p.id AND c.archived = 0) AS conversation_count,
                (SELECT COUNT(*) FROM files f WHERE f.project_id = p.id) AS file_count
         FROM projects p ORDER BY p.updated_at DESC`,
      )
      .all()
      .map(mapProject)
  },

  update(id, patch = {}) {
    const current = this.get(id)
    if (!current) return null
    const fields = []
    const params = []
    const set = (col, value) => {
      fields.push(`${col} = ?`)
      params.push(value)
    }
    if (patch.name !== undefined) set('name', String(patch.name).slice(0, 80))
    if (patch.description !== undefined) set('description', String(patch.description).slice(0, 400))
    if (patch.instructions !== undefined) set('instructions', String(patch.instructions).slice(0, 8000))
    if (patch.context !== undefined) set('context', String(patch.context).slice(0, 20_000))
    if (patch.accent !== undefined) set('accent', String(patch.accent).slice(0, 24))
    set('updated_at', nowIso())
    params.push(id)
    getDb().prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    return this.get(id)
  },

  remove(id) {
    const conn = getDb()
    conn.prepare(`UPDATE conversations SET project_id = NULL WHERE project_id = ?`).run(id)
    const files = conn.prepare(`SELECT stored_path FROM files WHERE project_id = ?`).all(id)
    conn.prepare(`DELETE FROM files WHERE project_id = ?`).run(id)
    for (const row of files) {
      try {
        fs.rmSync(row.stored_path, { force: true })
      } catch {
        /* already removed */
      }
    }
    conn.prepare(`DELETE FROM projects WHERE id = ?`).run(id)
  },
}

/* --------------------------------- files -------------------------------- */

export const files = {
  create(row) {
    const id = row.id || newId()
    getDb()
      .prepare(
        `INSERT INTO files (id, name, size, mime, kind, stored_path, text, truncated, page_count, warning,
                            conversation_id, message_id, project_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        row.name,
        row.size,
        row.mime,
        row.kind,
        row.stored_path,
        row.text || '',
        row.truncated ? 1 : 0,
        row.pageCount ?? null,
        row.warning ?? null,
        row.conversationId ?? null,
        row.messageId ?? null,
        row.projectId ?? null,
        nowIso(),
      )
    return this.get(id)
  },

  get(id) {
    return mapFile(getDb().prepare(`SELECT * FROM files WHERE id = ?`).get(id))
  },

  rawRow(id) {
    return getDb().prepare(`SELECT * FROM files WHERE id = ?`).get(id) || null
  },

  list({ conversationId = null, projectId = null, limit = 200 } = {}) {
    const params = []
    const where = []
    if (conversationId) {
      where.push('conversation_id = ?')
      params.push(conversationId)
    }
    if (projectId) {
      where.push('project_id = ?')
      params.push(projectId)
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    params.push(limit)
    return getDb()
      .prepare(`SELECT * FROM files ${clause} ORDER BY created_at DESC LIMIT ?`)
      .all(...params)
      .map(mapFile)
  },

  attach(ids, { conversationId, messageId = null }) {
    const conn = getDb()
    for (const id of ids) {
      conn
        .prepare(`UPDATE files SET conversation_id = ?, message_id = ? WHERE id = ?`)
        .run(conversationId, messageId, id)
    }
  },

  remove(id) {
    const conn = getDb()
    const row = this.rawRow(id)
    if (!row) return false
    conn.prepare(`DELETE FROM files WHERE id = ?`).run(id)
    try {
      fs.rmSync(row.stored_path, { force: true })
    } catch {
      /* already removed */
    }
    return true
  },
}

/* ------------------------------- settings ------------------------------- */

export const DEFAULT_SETTINGS = {
  name: '',
  responseStyle: 'balanced', // simple | balanced | detailed
  language: 'english', // english | hindi | bengali | hinglish
  theme: 'dark', // dark | light | system
  defaultMode: 'fast',
  autoTitle: true,
  sendOnEnter: true,
  voiceInput: true,
  readAloud: false,
  speakRate: 1,
  speechEnabled: false, // set at runtime by the browser
  reducedMotion: false,
}

export const settings = {
  getAll() {
    const rows = getDb().prepare(`SELECT key, value FROM settings`).all()
    const stored = {}
    for (const row of rows) {
      try {
        stored[row.key] = JSON.parse(row.value)
      } catch {
        stored[row.key] = row.value
      }
    }
    return { ...DEFAULT_SETTINGS, ...stored }
  },

  set(patch = {}) {
    const conn = getDb()
    const stmt = conn.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_SETTINGS)) continue
      stmt.run(key, JSON.stringify(value))
    }
    return this.getAll()
  },

  reset() {
    getDb().prepare(`DELETE FROM settings`).run()
    return this.getAll()
  },
}

export function initDb() {
  return getDb()
}

export function conversationExists(id) {
  return conversations.exists(id)
}

export function assertConversationLimit() {
  if (conversations.count() >= LIMITS.conversations) {
    const err = new Error('conversation_limit')
    err.code = 'conversation_limit'
    throw err
  }
}

export { LIMITS, path }