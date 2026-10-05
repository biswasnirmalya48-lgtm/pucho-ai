/**
 * Storage-agnostic SQLite access.
 *
 * Two drivers sit behind one async API so the rest of the server never
 * cares where the database lives:
 *
 *   - `node:sqlite` against `data/pucho.db` for local development.
 *   - libSQL / Turso over HTTP when `TURSO_DATABASE_URL` is set, which is
 *     what Vercel serverless functions use (their disk is ephemeral).
 *
 * Both speak the same SQL dialect, so `db.js` is shared verbatim.
 *
 * Integers are normalised to JavaScript numbers: libSQL hands back `bigint`
 * for some aggregates, and `JSON.stringify` throws on `bigint`.
 */
import fs from 'node:fs'
import path from 'node:path'

import { DB_PATH, TURSO, USE_TURSO, IS_SERVERLESS, ensureDirs } from './config.js'

export const DRIVER = USE_TURSO ? 'turso' : 'sqlite'

/**
 * Without a Turso URL a serverless deployment still needs a database. It has
 * no writable disk, so it gets an in-memory SQLite database instead: the app
 * works, but every cold start starts empty.
 */
export const EPHEMERAL = !USE_TURSO && IS_SERVERLESS
const LOCAL_TARGET = EPHEMERAL ? ':memory:' : DB_PATH

let remote = null
let ready = null
let pendingSchema = null

/** Values libSQL accepts as bind parameters. */
const normaliseArg = (value) => {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Uint8Array || typeof value === 'string') return value
  return String(value)
}

const normaliseArgs = (params) => (params || []).map(normaliseArg)

/** Convert `bigint` columns to numbers so responses stay JSON-serialisable. */
const normaliseRow = (row) => {
  if (!row) return null
  for (const key of Object.keys(row)) {
    if (typeof row[key] === 'bigint') row[key] = Number(row[key])
  }
  return row
}

/**
 * Split a schema script into single statements. libSQL executes one
 * statement per `execute()` call, unlike `node:sqlite`'s `exec()`.
 */
export function splitStatements(sql) {
  const out = []
  let current = ''
  let quote = null
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i]
    if (quote) {
      current += ch
      if (ch === quote) {
        // A doubled quote is an escaped quote, not a terminator.
        if (sql[i + 1] === quote) {
          current += sql[++i]
        } else {
          quote = null
        }
      }
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      current += ch
      continue
    }
    if (ch === ';') {
      if (current.trim()) out.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) out.push(current.trim())
  return out
}

let local = null
let localPromise = null

/**
 * Open the local database. `node:sqlite` is imported lazily because it only
 * exists on Node >= 22.5 and is never needed when TURSO_DATABASE_URL is set
 * — importing it eagerly would break the serverless runtime for no reason.
 */
function getLocal() {
  if (local) return Promise.resolve(local)
  if (!localPromise) {
    localPromise = (async () => {
      const { DatabaseSync } = await import('node:sqlite')
      if (!EPHEMERAL) {
        ensureDirs()
        fs.mkdirSync(path.dirname(LOCAL_TARGET), { recursive: true })
      }
      const conn = new DatabaseSync(LOCAL_TARGET)
      conn.exec('PRAGMA journal_mode = WAL')
      conn.exec('PRAGMA foreign_keys = ON')
      conn.exec('PRAGMA busy_timeout = 5000')
      local = conn
      return conn
    })()
  }
  return localPromise
}

async function getRemote() {
  if (remote) return remote
  const { createClient } = await import('@libsql/client')
  remote = createClient({
    url: TURSO.url,
    ...(TURSO.authToken ? { authToken: TURSO.authToken } : {}),
  })
  return remote
}

/* ------------------------------- API ---------------------------------- */

export async function run(sql, params = []) {
  await ensureReady()
  if (!USE_TURSO) {
    const conn = await getLocal()
    conn.prepare(sql).run(...normaliseArgs(params))
    return { changes: 1 }
  }
  const client = await getRemote()
  const result = await client.execute({ sql, args: normaliseArgs(params) })
  return { changes: result.rowsAffected ?? 0 }
}

export async function all(sql, params = []) {
  await ensureReady()
  if (!USE_TURSO) {
    const conn = await getLocal()
    return conn
      .prepare(sql)
      .all(...normaliseArgs(params))
      .map(normaliseRow)
  }
  const client = await getRemote()
  const result = await client.execute({ sql, args: normaliseArgs(params) })
  return result.rows.map(normaliseRow)
}

export async function get(sql, params = []) {
  const rows = await all(sql, params)
  return rows[0] ?? null
}

/** Run a multi-statement script (schema creation). */
export async function exec(sql) {
  await ensureReady()
  const statements = splitStatements(sql)
  if (!USE_TURSO) {
    const conn = await getLocal()
    for (const statement of statements) conn.exec(statement)
    return
  }
  const client = await getRemote()
  await client.batch(statements.map((stmt) => ({ sql: stmt })), 'write')
}

/**
 * Run several statements as one unit of work. Remote libSQL batches are
 * atomic, which keeps multi-row updates from interleaving across the
 * concurrent serverless invocations.
 */
export async function batch(entries) {
  const list = entries.filter(Boolean)
  if (!list.length) return
  await ensureReady()
  if (!USE_TURSO) {
    const conn = await getLocal()
    conn.exec('BEGIN')
    try {
      for (const entry of list) conn.prepare(entry.sql).run(...normaliseArgs(entry.params))
      conn.exec('COMMIT')
    } catch (err) {
      conn.exec('ROLLBACK')
      throw err
    }
    return
  }
  const client = await getRemote()
  await client.batch(
    list.map((entry) => ({ sql: entry.sql, args: normaliseArgs(entry.params) })),
    'write',
  )
}

/** Run the raw statements without re-entering the readiness gate. */
async function execRaw(sql) {
  const statements = splitStatements(sql)
  if (!USE_TURSO) {
    const conn = await getLocal()
    for (const statement of statements) conn.exec(statement)
    return
  }
  const client = await getRemote()
  await client.batch(statements.map((stmt) => ({ sql: stmt })), 'write')
}

/**
 * Create the connection and apply the schema. Safe to call repeatedly.
 *
 * Every query also calls `ensureReady()` first, so the database is usable
 * even if a caller forgets to initialise it explicitly.
 */
export async function init(schema) {
  if (schema) pendingSchema = schema
  if (!ready) {
    ready = (async () => {
      if (USE_TURSO) {
        const client = await getRemote()
        await client.execute('PRAGMA foreign_keys = ON')
      }
      if (pendingSchema) await execRaw(pendingSchema)
    })()
  }
  return ready
}

async function ensureReady() {
  return ready || init()
}

export function isRemote() {
  return USE_TURSO
}