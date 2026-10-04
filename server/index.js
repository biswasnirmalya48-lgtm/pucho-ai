/**
 * PUCHO server entrypoint.
 *
 * Serves the JSON/SSE API and, in production, the built client.  The GROQ key
 * is read from the environment and never leaves this process.
 */
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'

import {
  APP_NAME,
  APP_VERSION,
  TAGLINE,
  IS_PROD,
  PORT,
  HOST,
  LIMITS,
  ALLOWED_ORIGINS,
  CLIENT_DIST,
  ensureDirs,
} from './config.js'
import { initDb, conversations } from './db.js'
import { requestId, logger, notFound, errorHandler } from './middleware/errors.js'
import { resolveRuntimeModels } from './services/models.js'
import chatRouter from './routes/chat.js'
import conversationsRouter from './routes/conversations.js'
import projectsRouter from './routes/projects.js'
import filesRouter from './routes/files.js'
import settingsRouter from './routes/settings.js'
import statusRouter from './routes/status.js'
import voiceRouter from './routes/voice.js'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.set('etag', false)

/* ----------------------------- middleware ------------------------------ */

app.use((req, res, next) => {
  req.id = requestId()
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()')
  if (IS_PROD) {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "media-src 'self' data: blob:",
        "font-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    )
  }
  if (req.path.startsWith('/api')) {
    const started = Date.now()
    res.on('finish', () => {
      logger(req, res.statusCode >= 500 ? 'error' : 'info', 'request', {
        status: res.statusCode,
        ms: Date.now() - started,
      })
    })
  }
  next()
})

// Dev-only CORS so `vite` on another port can talk to the API.
app.use((req, res, next) => {
  const origin = req.headers.origin
  const allowed =
    ALLOWED_ORIGINS.includes(origin) ||
    (!IS_PROD && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin ?? ''))
  if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

app.use(express.json({ limit: LIMITS.jsonBody }))
app.use(express.urlencoded({ extended: false, limit: LIMITS.jsonBody }))

/* -------------------------------- routes ------------------------------- */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: APP_NAME, version: APP_VERSION, tagline: TAGLINE })
})

app.use('/api/chat', chatRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/files', filesRouter)
app.use('/api/settings', settingsRouter)
app.use('/api', statusRouter)
app.use('/api', voiceRouter)

/* --------------------------- static client ----------------------------- */

if (fs.existsSync(CLIENT_DIST)) {
  app.use(
    express.static(CLIENT_DIST, {
      index: false,
      setHeaders(res, filePath) {
        if (/\.(js|css|woff2?|svg|png|jpg|jpeg|webp|gif|ico)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }),
  )
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    return res.sendFile(path.join(CLIENT_DIST, 'index.html'))
  })
} else {
  app.get('/', (req, res) => {
    res.status(200).type('text/plain').send(
      `${APP_NAME} ${APP_VERSION} API is running.\n${TAGLINE}\nBuild the client with: npm run build\n`,
    )
  })
}

app.use(notFound)
app.use(errorHandler)

/* ------------------------------- startup ------------------------------- */

ensureDirs()
initDb()

const server = app.listen(PORT, HOST, () => {
  logger(null, 'info', `${APP_NAME} server ready`, {
    url: `http://${HOST}:${PORT}`,
    mode: IS_PROD ? 'production' : 'development',
    client: fs.existsSync(CLIENT_DIST) ? 'served from dist' : 'run `npm run dev` for the client',
    conversations: conversations.count(),
  })
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