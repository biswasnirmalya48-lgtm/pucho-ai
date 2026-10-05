/**
 * Uploaded-file storage.
 *
 * PUCHO keeps two interchangeable backends behind one small API so the
 * routes never branch on the environment:
 *
 *   - Local disk under `data/uploads` for development.
 *   - Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, which is required on
 *     serverless where the function's filesystem is read-only and ephemeral.
 *
 * Locators are prefixed with their backend (`disk:…` / `blob:…`) so a row
 * written in one environment still resolves correctly if it is read in
 * another.
 */
import fs from 'node:fs'
import path from 'node:path'

import { UPLOAD_DIR, BLOB, USE_BLOB, IS_SERVERLESS, ensureDirs } from './config.js'

export const STORAGE = USE_BLOB ? 'vercel-blob' : 'disk'

/** Raised when uploads arrive but no writable storage backend is configured. */
export class StorageUnavailableError extends Error {
  constructor() {
    super('File uploads are not configured on this deployment.')
    this.name = 'StorageUnavailableError'
    this.code = 'storage_unavailable'
    this.status = 503
  }
}

const DISK_PREFIX = 'disk:'
const BLOB_PREFIX = 'blob:'

export const diskLocator = (absolutePath) => `${DISK_PREFIX}${absolutePath}`
export const blobLocator = (url) => `${BLOB_PREFIX}${url}`

const toBuffer = async (body) => {
  if (!body) return Buffer.alloc(0)
  if (Buffer.isBuffer(body)) return body
  if (typeof body === 'string') return Buffer.from(body)
  if (body instanceof Uint8Array) return Buffer.from(body)
  if (body instanceof ArrayBuffer) return Buffer.from(new Uint8Array(body))
  if (typeof body.pipe === 'function') {
    const chunks = []
    for await (const chunk of body) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks)
  }
  return Buffer.from(String(body))
}

/**
 * Persist bytes and return the locator to store in the database.
 * `key` should already be a safe, unique filename.
 */
export async function put(key, body, mime = 'application/octet-stream') {
  const buffer = await toBuffer(body)
  if (USE_BLOB) {
    const { put: blobPut } = await import('@vercel/blob')
    const result = await blobPut(`uploads/${key}`, buffer, {
      access: 'public',
      contentType: mime,
      token: BLOB.token,
      cacheControlMaxAge: 3600,
    })
    return blobLocator(result.url)
  }
  // A serverless filesystem is read-only, so disk uploads cannot work there.
  if (IS_SERVERLESS) throw new StorageUnavailableError()
  ensureDirs()
  const target = path.join(UPLOAD_DIR, path.basename(key))
  await fs.promises.writeFile(target, buffer)
  return diskLocator(target)
}

/**
 * Read stored bytes back. Returns `null` when the object is gone, so the
 * caller can answer 404 instead of crashing on a stale database row.
 */
export async function read(locator) {
  if (!locator) return null
  if (locator.startsWith(BLOB_PREFIX)) {
    const url = locator.slice(BLOB_PREFIX.length)
    try {
      const response = await fetch(url)
      if (!response.ok) return null
      const buffer = Buffer.from(await response.arrayBuffer())
      return { buffer, size: buffer.length }
    } catch {
      return null
    }
  }
  const filePath = locator.startsWith(DISK_PREFIX) ? locator.slice(DISK_PREFIX.length) : locator
  try {
    const buffer = await fs.promises.readFile(filePath)
    return { buffer, size: buffer.length }
  } catch {
    return null
  }
}

/** Best-effort delete. A missing object is a success, not an error. */
export async function remove(locator) {
  if (!locator) return false
  if (locator.startsWith(BLOB_PREFIX)) {
    try {
      const { del } = await import('@vercel/blob')
      await del(locator.slice(BLOB_PREFIX.length), { token: BLOB.token })
      return true
    } catch {
      return false
    }
  }
  const filePath = locator.startsWith(DISK_PREFIX) ? locator.slice(DISK_PREFIX.length) : locator
  try {
    await fs.promises.rm(filePath, { force: true })
    return true
  } catch {
    return false
  }
}

export async function exists(locator) {
  if (!locator) return false
  if (locator.startsWith(BLOB_PREFIX)) {
    try {
      const { head } = await import('@vercel/blob')
      await head(locator.slice(BLOB_PREFIX.length), { token: BLOB.token })
      return true
    } catch {
      return false
    }
  }
  const filePath = locator.startsWith(DISK_PREFIX) ? locator.slice(DISK_PREFIX.length) : locator
  try {
    await fs.promises.access(filePath)
    return true
  } catch {
    return false
  }
}