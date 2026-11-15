import { CAUSES, PHENS } from './data'
import type { Case, Cause } from './data'

// 自分の言葉で探す：入力した言葉を2文字ずつに分けて、原因の説明・点検・過去の事例の文と照らし合わせる。
// 言い換え（例：「欠け」「かけた」）は、下の表で現象に結びつける。

const SYN: [RegExp, string][] = [
  [/欠け|かけ|チッピング|割れ|われ|ちっぴんぐ|クラック/, 'chip'],
  [/荒|あれ|ざらつ|筋|すじ|キズ|傷|きず|焼け|やけ|変色|面粗|面あら|光沢|曇/, 'rough'],
  [/寸法|ズレ|ずれ|公差|ばらつ|バラつ|大きく|小さく|大きい|小さい|太い|細い|測|NG/, 'dim'],
  [/ビビ|びび|振動|異音|縞|しま|うなり|共振|音が/, 'chatter'],
  [/バリ|ばり|かえり|返り|ささくれ/, 'burr'],
]

const NOT_ONLY_HIRAGANA = /[^぀-ゟ\s、。，．,.!?！？「」（）()・]/

function bigrams(text: string): string[] {
  const clean = text.replace(/[\s、。，．,.!?！？「」（）()・]+/g, ' ').trim()
  const out = new Set<string>()
  for (const tok of clean.split(' ')) {
    for (let i = 0; i + 2 <= tok.length; i++) {
      const g = tok.slice(i, i + 2)
      if (NOT_ONLY_HIRAGANA.test(g)) out.add(g)
    }
    if (tok.length === 1 && NOT_ONLY_HIRAGANA.test(tok)) out.add(tok)
  }
  return [...out]
}

export type FreeHit = { c: Cause; score: number; words: string[] }

export function searchFree(query: string, cases: Case[]): { hits: FreeHit[]; looseCases: Case[] } {
  const grams = bigrams(query)
  if (grams.length === 0) return { hits: [], looseCases: [] }
  const phBoost = new Set<string>()
  for (const [re, ph] of SYN) if (re.test(query)) phBoost.add(ph)

  const hits: FreeHit[] = []
  for (const c of CAUSES) {
    const phName = PHENS.find((p) => p.id === c.ph)?.name ?? ''
    const body = [c.name, c.why, c.item, c.revise, phName, ...c.checks].join(' ')
    const cs = cases.filter((x) => x.cause === c.id).map((x) => [x.what, x.reason, x.measure, x.material].join(' ')).join(' ')
    let score = 0
    const words: string[] = []
    for (const g of grams) {
      const inBody = body.includes(g)
      const inCases = cs.includes(g)
      if (inBody) score += 1
      if (inCases) score += 0.5
      if ((inBody || inCases) && !/[぀-ゟ]/.test(g)) words.push(g)
    }
    if (phBoost.has(c.ph)) score += 3
    if (score > 0) hits.push({ c, score, words })
  }
  hits.sort((a, b) => b.score - a.score)

  // 原因が未特定の事例のうち、言葉が近いもの
  const loose = cases
    .filter((x) => x.cause === 'other')
    .map((x) => {
      const t = [x.what, x.reason, x.measure, x.material].join(' ')
      return { x, n: grams.filter((g) => t.includes(g)).length }
    })
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((r) => r.x)
  return { hits: hits.slice(0, 5), looseCases: loose.slice(0, 5) }
}
