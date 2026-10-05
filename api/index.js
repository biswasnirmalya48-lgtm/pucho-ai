/**
 * Vercel serverless entry point for the PUCHO API.
 *
 * Vercel's Node runtime hands over Node's own `req`/`res`, so the Express app
 * can be invoked directly and SSE responses (`res.write`) stream through
 * exactly as they do behind the local server.
 */
import app from '../server/app.js'
import { initDb } from '../server/db.js'
import { resolveRuntimeModels } from '../server/services/models.js'

let warmed = false

export default async function handler(req, res) {
  // Cheap after the first call: `initDb` memoises the connection and schema.
  await initDb()

  // Warm model discovery once per instance so the first chat is not slowed
  // down by a `/models` round-trip.
  if (!warmed) {
    warmed = true
    resolveRuntimeModels().catch(() => {})
  }

  return app(req, res)
}