/**
 * Web search for RESEARCH mode.
 *
 * Only real provider responses are ever returned; there is no offline
 * fallback and no synthetic result set.  When nothing is configured the
 * caller is told research is unavailable so it can say so to the user.
 */
import { WEB_SEARCH } from '../config.js'

export function configuredProvider() {
  if (WEB_SEARCH.provider) {
    const p = WEB_SEARCH.provider.toLowerCase()
    if (p === 'tavily' && WEB_SEARCH.tavilyKey) return 'tavily'
    if (p === 'serper' && WEB_SEARCH.serperKey) return 'serper'
    if (p === 'brave' && WEB_SEARCH.braveKey) return 'brave'
  }
  if (WEB_SEARCH.tavilyKey) return 'tavily'
  if (WEB_SEARCH.serperKey) return 'serper'
  if (WEB_SEARCH.braveKey) return 'brave'
  return null
}

export function isSearchAvailable() {
  return configuredProvider() !== null
}

const isHttpUrl = (value) => {
  try {
    const url = new URL(String(value))
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const hostOf = (value) => {
  try {
    return new URL(String(value)).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function normalize(results, maxResults) {
  const seen = new Set()
  const out = []
  for (const item of results) {
    const url = item?.url
    if (!isHttpUrl(url)) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push({
      title: String(item.title || hostOf(url)).slice(0, 200),
      url: String(url),
      snippet: String(item.snippet || '').replace(/\s+/g, ' ').slice(0, 600),
      source: hostOf(url),
    })
    if (out.length >= maxResults) break
  }
  return out
}

async function searchTavily(query, signal) {
  const res = await fetch(WEB_SEARCH.tavilyUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      api_key: WEB_SEARCH.tavilyKey,
      query,
      max_results: WEB_SEARCH.maxResults,
      search_depth: 'basic',
      include_answer: false,
      include_raw_content: false,
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`tavily_http_${res.status}`)
  return (body?.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.content || r.raw_content }))
}

async function searchSerper(query, signal) {
  const res = await fetch(WEB_SEARCH.serperUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-KEY': WEB_SEARCH.serperKey },
    signal,
    body: JSON.stringify({ q: query, num: WEB_SEARCH.maxResults }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`serper_http_${res.status}`)
  return (body?.organic || []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }))
}

async function searchBrave(query, signal) {
  const url = `${WEB_SEARCH.braveUrl}?q=${encodeURIComponent(query)}&count=${WEB_SEARCH.maxResults}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'X-Subscription-Token': WEB_SEARCH.braveKey,
      'Accept-Encoding': 'gzip',
    },
    signal,
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`brave_http_${res.status}`)
  return (body?.web?.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.description }))
}

const RUNNERS = { tavily: searchTavily, serper: searchSerper, brave: searchBrave }

/**
 * @returns {Promise<{status:'ok'|'unavailable'|'error'|'empty', provider:string|null, results:Array, reason?:string}>}
 */
export async function searchWeb(query, { signal } = {}) {
  const provider = configuredProvider()
  if (!provider) return { status: 'unavailable', provider: null, results: [], reason: 'not_configured' }
  const clean = String(query || '').trim().slice(0, 800)
  if (!clean) return { status: 'unavailable', provider, results: [], reason: 'empty_query' }

  const timeout = AbortSignal.timeout(WEB_SEARCH.timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  try {
    const raw = await RUNNERS[provider](clean, combined)
    const results = normalize(Array.isArray(raw) ? raw : [], WEB_SEARCH.maxResults)
    if (!results.length) return { status: 'empty', provider, results: [], reason: 'no_results' }
    return { status: 'ok', provider, results }
  } catch (err) {
    return {
      status: 'error',
      provider,
      results: [],
      reason: String(err?.message || err),
    }
  }
}