import type { Lang } from './i18n'

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** i
  const decimals = value >= 100 || i === 0 ? 0 : 1
  return `${value.toFixed(decimals)} ${units[i]}`
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  const seconds = ms / 1000
  if (seconds < 1) return '<1s'
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

const RELATIVE: Record<Lang, Record<string, string>> = {
  english: { now: 'just now', m: 'min ago', h: 'hr ago', d: 'yesterday', w: 'last week' },
  hindi: { now: 'अभी', m: 'मिनट पहले', h: 'घंटे पहले', d: 'कल', w: 'पिछले हफ़्ते' },
  bengali: { now: 'এইমাত্র', m: 'মিনিট আগে', h: 'ঘণ্টা আগে', d: 'গতকাল', w: 'গত সপ্তাহে' },
  hinglish: { now: 'abhi', m: 'min pehle', h: 'ghante pehle', d: 'kal', w: 'pichhle hafte' },
}

export function relativeTime(iso: string, lang: Lang = 'english'): string {
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return ''
  const diff = Date.now() - time
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const words = RELATIVE[lang] ?? RELATIVE.english
  if (diff < minute) return words.now
  if (diff < hour) return `${Math.floor(diff / minute)} ${words.m}`
  if (diff < day) return `${Math.floor(diff / hour)} ${words.h}`
  if (diff < 2 * day) return words.d
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`
  if (diff < 365 * day) {
    return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' })
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Date separator label for the sidebar's grouped conversation list. */
export function groupLabel(iso: string, lang: Lang = 'english'): string {
  const date = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const time = date.getTime()
  if (time >= startOfToday) return lang === 'english' ? 'Today' : lang === 'hindi' ? 'आज' : lang === 'bengali' ? 'আজ' : 'Aaj'
  if (time >= startOfToday - 7 * 86_400_000) {
    return lang === 'english' ? 'Previous 7 days' : lang === 'hindi' ? 'पिछले 7 दिन' : lang === 'bengali' ? 'গত ৭ দিন' : 'Pichhle 7 din'
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: 'long' })
  }
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export const isImage = (kind?: string, mime?: string) =>
  kind === 'image' || (mime ? mime.startsWith('image/') : false)