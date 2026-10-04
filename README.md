# PUCHO

> **Bas Pucho.** — Ask anything. Pucho everything.

PUCHO is a fast, intelligent, friendly AI assistant. It streams answers from
[GROQ](https://groq.com), keeps every conversation, understands projects and
files, and talks in your language. It has its own identity — minimal black &
white, glass used sparingly — and none of the usual AI-clone furniture.

```
browser ──HTTP/SSE──▶ PUCHO server ──HTTPS──▶ GROQ API ──▶ model
                          │
                          └── SQLite (chats, messages, projects, files, settings)
```

The GROQ key is read from the environment **inside the server process only**.
It is never sent to the browser, never bundled, and `.env` is git-ignored.

---

## Quick start

```bash
npm install
cp .env.example .env        # then paste your GROQ_API_KEY into .env
npm run build               # build the client
npm start                   # http://127.0.0.1:8787
```

For development (client on :5173 with hot reload, API on :8787):

```bash
npm run dev
```

Requires Node.js 20.11+ (uses the built-in `node:sqlite`; Node 22+ recommended).

---

## Configuration

Everything is optional except `GROQ_API_KEY`. See [`.env.example`](.env.example).

| Variable | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Your GROQ key. Server-side only. |
| `GROQ_API_URL` | Defaults to `https://api.groq.com/openai/v1`. |
| `GROQ_MODEL` | One model for every mode (this project ships with `qwen/qwen3.8-27b`). |
| `GROQ_MODEL_FAST` … `GROQ_MODEL_RESEARCH` | Optional per-mode overrides. |
| `GROQ_MODEL_VISION` | Optional vision-capable model for image uploads. |
| `GROQ_MAX_TOKENS` | Max output tokens per answer (default 4096). |
| `GROQ_TIMEOUT_MS` | Per-request timeout (default 180000). |
| `PORT` / `HOST` / `DATA_DIR` | Where the server listens and stores data. |
| `TAVILY_API_KEY` / `SERPER_API_KEY` / `BRAVE_SEARCH_API_KEY` | Enables live sources in RESEARCH mode. |
| `TTS_PROVIDER` + `TTS_API_KEY` | Optional server-side speech. Browser voices are used otherwise. |
| `MAX_FILE_BYTES`, `MAX_IMAGE_BYTES`, `MAX_MESSAGE_CHARS` | Upload and message limits. |
| `RATE_LIMIT_*` | Per-minute request budgets (chat default 45/min). |

### Models

Mode → model resolution lives in one place (`server/services/models.js`) and is
tried in this order:

1. the mode's own env var (`GROQ_MODEL_THINK`, …)
2. `GROQ_MODEL` — one model for everything
3. a built-in default that the key can actually reach
4. the first model GROQ reports for that key

`GET /api/status` reports the resolved model per mode, so **Settings → AI**
always shows the truth. Vision capability is detected from the model id; if a
mode cannot read images, PUCHO says so plainly instead of guessing.

### Live web research (RESEARCH mode)

Add one search key and RESEARCH mode searches first, then answers with real
citations and a Sources list. Without a key, PUCHO tells the user that live web
research is unavailable and answers from model knowledge — it never invents
URLs. Supported providers: Tavily, Serper, Brave.

---

## Features

- **Real streaming** with a subtle *“PUCHO is thinking…”* state, stop mid-answer.
- **Five modes** — ⚡ Fast, 🧠 Think, 💻 Code, 📚 Study, 🔎 Research — mapped to
  models server-side so users never choose model names.
- **Markdown** with headings, lists, tables, links, blockquotes, KaTeX math and
  syntax-highlighted code with a copy button.
- **Message actions** — copy, copy response, regenerate, edit your message,
  continue, delete chat.
- **Conversations** — auto-titled from your first question, rename, archive,
  delete, search across titles + questions + answers, paginated history.
- **Projects** — instructions + context + files applied to every chat inside them.
- **Files** — PDF, DOCX, TXT, code and images, with real text extraction. If a
  file cannot be parsed, PUCHO says so rather than pretending to have read it.
- **Images** — vision when the configured model supports it, an explicit,
  honest explanation when it does not.
- **Voice** — browser speech recognition for dictation, and read-aloud with the
  browser's voices (optional server TTS).
- **Personalisation** — name, response style (Simple/Balanced/Detailed),
  language (English/हिन्दी/বাংলা/Hinglish), theme, default mode.
- **Keyboard** — `⌘/Ctrl+K` search, `⌘/Ctrl+N` new chat, `⌘/Ctrl+Enter` send,
  `Esc` close.
- **Responsive** — the sidebar becomes a drawer on mobile; no horizontal scroll.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API + Vite dev server with HMR. |
| `npm run build` | Production client build into `dist/`. |
| `npm start` | Serves API **and** the built client from one process. |
| `npm test` | Unit tests (44) for validation, extraction, prompts, models, persistence, rate limiting. |
| `npm run typecheck` | TypeScript check for the client. |
| `node scripts/e2e-smoke.js` | End-to-end API suite (37 checks) against a running server. |
| `node scripts/mock-provider.js` | Local GROQ + search stub for offline development. |

### Testing without a key

```bash
node scripts/mock-provider.js &          # GROQ-compatible stub on :9090
GROQ_API_URL=http://127.0.0.1:9090/v1 \
GROQ_API_KEY=local-test-key \
GROQ_MODEL=mock-versatile \
node server/index.js
```

The stub also has failure models (`mock-401`, `mock-429`, `mock-500`,
`mock-slow`, `mock-empty`) so error handling and *stop* can be exercised
deterministically. PUCHO itself never fabricates answers.

---

## HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/chat` | SSE stream. Actions: `send`, `regenerate`, `continue`, `truncate`. |
| `GET` | `/api/status` | Capabilities, resolved models, limits (no secrets). |
| `GET` | `/api/models` | Models the key can reach. |
| `GET/POST/PATCH/DELETE` | `/api/conversations[/:id]` | Chat CRUD, message pagination, bulk ops. |
| `GET` | `/api/conversations/search?q=` | Search titles, questions and answers. |
| `GET/POST/PATCH/DELETE` | `/api/projects[/:id]` | Project CRUD. |
| `POST/GET/DELETE` | `/api/files[/:id]` | Uploads (multipart), extraction, raw bytes. |
| `GET/PATCH/POST` | `/api/settings` | Personalisation. |
| `POST` | `/api/tts` | Optional server speech (501 when unconfigured). |

`/api/chat` emits `open`, `title`, `meta`, `search`, `delta`, `done`, `truncated`
and `error` events. Errors are human-readable; upstream payloads stay in the
server log.

---

## Security

- API key only in server-side environment; never exposed to the browser.
- Input validation and size caps on every route (messages, files, ids, settings).
- Per-IP rate limiting on chat, writes, uploads, search and reads.
- Uploads stored outside the web root with generated names, MIME/extension
  allow-list, `nosniff` + sandbox CSP on served bytes.
- Markdown renders without raw HTML (`rehype-raw` is not used); syntax
  highlighting output is escaped by highlight.js.
- Untrusted material (project context, file text, search results) is wrapped in
  delimiters and labelled as data so instructions inside a document cannot take
  over the assistant.
- Strict CSP in production; `frame-ancestors 'none'`.

---

## Data

Everything lives in `DATA_DIR` (default `data/`): `pucho.db` (SQLite, WAL) and
`uploads/`. **Settings → Data** exports every conversation as JSON and can
delete all chats. Deleting a conversation also removes its stored files.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| *“PUCHO isn't connected to a model yet.”* | `GROQ_API_KEY` missing — check `.env`, restart. |
| *“PUCHO is getting too many requests at once.”* | Provider rate limit (often output tokens per minute). PUCHO retries once automatically; wait a moment and send again. |
| *“…can't read images yet.”* | The configured model has no vision. Set `GROQ_MODEL_VISION`, or pick a vision-capable model. |
| *“Live web research is not configured.”* | Add a Tavily/Serper/Brave key for live sources. |
| *“Server-side speech is not configured.”* | Expected — PUCHO falls back to the browser's voices. |
| Port 8787 busy | `PORT=8788 npm start`. |

## Project layout

```
server/
  index.js            express app, security headers, static client
  config.js           env, limits, per-mode model defaults
  db.js               SQLite schema + queries
  routes/             chat (SSE), conversations, projects, files, settings, status, voice
  services/           groq client, model resolution, prompt, titling, web search, extraction, tts
  lib/                validation, SSE writer
client/
  src/components/     sidebar, thread, message, markdown, composer, modes, projects, settings…
  src/lib/            store, api, types, i18n, formatting
tests/                node:test unit suites
scripts/              mock provider, end-to-end smoke suite
```