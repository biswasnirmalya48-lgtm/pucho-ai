/**
 * Real file text extraction.
 *
 * PDF -> pdfjs-dist, DOCX -> mammoth, TXT/code/CSV/JSON/Markdown -> UTF-8.
 * Anything we cannot genuinely read returns an explicit warning so the model
 * never pretends to have seen the contents.
 */
import path from 'node:path'
import { LIMITS } from '../config.js'

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.jsonl', '.yaml', '.yml', '.xml', '.html', '.htm',
  '.log', '.ini', '.toml', '.env', '.sql', '.sh', '.bash', '.zsh', '.py', '.js', '.jsx', '.ts', '.tsx',
  '.mjs', '.cjs', '.java', '.c', '.h', '.cpp', '.hpp', '.cs', '.go', '.rs', '.rb', '.php', '.swift',
  '.kt', '.kts', '.scala', '.r', '.m', '.pl', '.lua', '.dart', '.vue', '.svelte', '.css', '.scss',
  '.less', '.graphql', '.proto', '.dockerfile', '.gitignore', '.makefile', '.tex', '.rtf', '.srt', '.vtt',
])

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

export const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.txt', '.md', '.docx', '.doc', '.csv', '.json', '.log', '.rtf', ...IMAGE_EXTENSIONS, ...TEXT_EXTENSIONS,
])

export function classify(name = '', mime = '') {
  const ext = path.extname(name).toLowerCase()
  if (IMAGE_EXTENSIONS.has(ext) || String(mime).startsWith('image/')) return 'image'
  if (ext === '.pdf' || mime === 'application/pdf') return 'pdf'
  if (ext === '.docx' || mime.includes('wordprocessingml')) return 'docx'
  if (ext === '.doc' || mime === 'application/msword') return 'doc'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  if (String(mime).startsWith('text/')) return 'text'
  return 'binary'
}

export function isSupported(name, mime) {
  const kind = classify(name, mime)
  return kind !== 'binary'
}

function clip(text, limit = LIMITS.extractedTextChars) {
  const value = String(text ?? '')
  if (value.length <= limit) return { text: value, truncated: false }
  return { text: value.slice(0, limit), truncated: true }
}

async function extractPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise
  const pages = []
  let chars = 0
  const limit = LIMITS.extractedTextChars
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => (typeof item.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/[ \t]+/g, ' ')
      .trim()
    pages.push(line)
    chars += line.length
    page.cleanup()
    if (chars > limit) break
  }
  const pageCount = doc.numPages
  await doc.destroy().catch(() => {})
  return { text: pages.join('\n\n'), pageCount }
}

async function extractDocx(buffer) {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return { text: result.value || '', warning: result.messages?.length ? null : null }
}

function extractPlain(buffer) {
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  // A NUL byte in the first chunk means this is not really plain text.
  if (decoded.slice(0, 4096).includes('\u0000')) {
    return {
      text: '',
      warning:
        'This file looks like a binary or unsupported format, so no text could be extracted. Try a PDF, DOCX or TXT export.',
    }
  }
  return { text: decoded }
}

/**
 * @returns {Promise<{kind:string,text:string,truncated:boolean,pageCount:number|null,warning:string|null,error?:string}>}
 */
export async function extractText({ buffer, name, mime }) {
  const kind = classify(name, mime)
  if (kind === 'image') {
    return { kind, text: '', truncated: false, pageCount: null, warning: null }
  }
  if (kind === 'doc') {
    return {
      kind,
      text: '',
      truncated: false,
      pageCount: null,
      warning:
        'Legacy .doc files cannot be read here. Re-save as .docx, PDF or TXT and PUCHO will read it properly.',
    }
  }
  try {
    let result
    if (kind === 'pdf') result = await extractPdf(buffer)
    else if (kind === 'docx') result = await extractDocx(buffer)
    else result = extractPlain(buffer)

    const { text, truncated } = clip(result.text ?? '')
    let warning = result.warning || null
    if (!text.trim() && !warning) {
      warning =
        kind === 'pdf'
          ? 'No text could be extracted from this PDF — it is probably a scan. PUCHO cannot OCR it.'
          : 'This file appears to be empty.'
    }
    return { kind, text, truncated, pageCount: result.pageCount ?? null, warning }
  } catch (err) {
    const code = err?.name === 'PasswordException' ? 'This PDF is password protected.' : null
    return {
      kind,
      text: '',
      truncated: false,
      pageCount: null,
      warning:
        code ||
        `PUCHO could not parse this file (${String(err?.message || err).slice(0, 120)}). Try a PDF or TXT version.`,
      error: true,
    }
  }
}