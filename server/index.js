/**
 * PUCHO local server entrypoint.
 *
 * Builds the app from `app.js`, opens the database, and listens.  On Vercel
 * this file is not used at all — `api/index.js` imports `app.js` directly.
 */
import fs from 'node:fs'

import { APP_NAME, PORT, HOST, IS_PROD, CLIENT_DIST, ensureDirs } from './config.js'
import { initDb, conversations } from './db.js'
import { logger } from './middleware/errors.js'
import { resolveRuntimeModels } from './services/models.js'
import app from './app.js'

ensureDirs()
await initDb()

const server = app.listen(PORT, HOST, () => {
  logger(null, 'info', `${APP_NAME} server ready`, {
    url: `http://${HOST}:${PORT}`,
    mode: IS_PROD ? 'production' : 'development',
    client: fs.existsSync(CLIENT_DIST) ? 'served from dist' : 'run `npm run dev` for the client',
  })

  conversations
    .count()
    .then((count) => logger(null, 'info', 'conversations stored', { count }))
    .catch(() => {})

  // Warm model discovery so the first chat is not slowed down by /models.
  resolveRuntimeModels()
    .then((runtime) => {
      logger(null, 'info', 'models resolved', { modes: runtime.perMode, vision: runtime.visionCandidate })
    })
    .catch((err) => {
      logger(null, 'warn', 'model discovery unavailable', { detail: String(err?.message || err) })
    })
})

const shutdown = (signal) => {
  logger(null, 'info', 'shutting down', { signal })
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('unhandledRejection', (reason) => {
  logger(null, 'error', 'unhandled rejection', { detail: String(reason?.stack || reason) })
})

export default app