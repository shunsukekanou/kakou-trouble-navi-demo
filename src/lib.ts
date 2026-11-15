import { CAUSES, KINDS, OTHER, PHENS, SEED_CASES, STATUSES, causeName, phName } from './data'
import type { Case, Kind, Status } from './data'

const KEY = 'trouble-support:v1'

export function loadCases(): Case[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return SEED_CASES
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return v.filter(isCase)
  } catch {
    /* 保存が使えなくても動く */
  }
  return SEED_CASES
}
export function saveCases(list: Case[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* 保存できなくても画面は動く */
  }
}
export function resetCases() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* */
  }
}
export function isSaved(): boolean {
  try {
    return localStorage.getItem(KEY) !== null
  } catch {
    return false
  }
}

export function isCase(x: unknown): x is Case {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.date === 'string' &&
    KINDS.includes(o.kind as Kind) &&
    PHENS.some((p) => p.id === o.ph) &&
    typeof o.cause === 'string' &&
    typeof o.what === 'string' &&
    STATUSES.includes(o.status as Status)
  )
}

// ---- CSV ----
const HEAD = ['発生年月', '種別', '現象', '原因', '材質', '何が起きたか', '原因の詳細', '対策', '標準書への反映']

const q = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toCsv(list: Case[]): string {
  const rows = list.map((c) =>
    [c.date, c.kind, phName(c.ph), causeName(c.cause), c.material, c.what, c.reason, c.measure, c.status].map(q).join(','),
  )
  return '﻿' + [HEAD.map(q).join(','), ...rows].join('\r\n') + '\r\n'
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQ = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cur += '"'
          i++
        } else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cur)
      cur = ''
      if (row.some((c) => c !== '')) rows.push(row)
      row = []
    } else cur += ch
  }
  row.push(cur)
  if (row.some((c) => c !== '')) rows.push(row)
  return rows
}

export function fromCsv(text: string): { cases: Case[]; skipped: number } {
  const rows = parseCsv(text)
  if (rows.length === 0) return { cases: [], skipped: 0 }
  const start = rows[0][0] === HEAD[0] ? 1 : 0
  const cases: Case[] = []
  let skipped = 0
  for (const r of rows.slice(start)) {
    const [date, kind, ph, cause, material, what, reason, measure, status] = r.map((x) => (x ?? '').trim())
    const phen = PHENS.find((p) => p.name === ph)
    const k = KINDS.find((x) => x === kind)
    const st = STATUSES.find((x) => x === status) ?? '未反映'
    const cs = CAUSES.find((c) => c.name === cause && c.ph === phen?.id)
    if (!phen || !k || !what || !/^\d{4}-\d{2}$/.test(date)) {
      skipped++
      continue
    }
    cases.push({
      id: newId(),
      date,
      kind: k,
      ph: phen.id,
      cause: cs ? cs.id : OTHER,
      material: material ?? '',
      what,
      reason: reason ?? '',
      measure: measure ?? '',
      status: st,
    })
  }
  return { cases, skipped }
}

export function newId(): string {
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function ym(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
export const ymJa = (s: string) => {
  const [y, m] = s.split('-')
  return `${y}年${Number(m)}月`
}
