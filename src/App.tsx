import { useMemo, useRef, useState } from 'react'
import { CAUSES, KINDS, OTHER, PHENS, STATUSES, causeName, causeOf, phName } from './data'
import type { Case, Cause, Kind, Status } from './data'
import { download, fromCsv, isCase, isSaved, loadCases, newId, resetCases, saveCases, toCsv, ym, ymJa } from './lib'

type Tab = 'find' | 'cases' | 'revise'
type Draft = { ph: string; cause: string } | null

export default function App() {
  const [tab, setTab] = useState<Tab>('find')
  const [cases, setCasesRaw] = useState<Case[]>(loadCases)
  const [draft, setDraft] = useState<Draft>(null)
  const setCases = (l: Case[]) => {
    setCasesRaw(l)
    saveCases(l)
  }
  const go = (t: Tab) => {
    setTab(t)
    window.scrollTo(0, 0)
  }
  return (
    <div className="app">
      <header className="top no-print">
        <h1>加工トラブル原因ナビ</h1>
        <p>現象をタップ → 原因の候補と点検の順番 → 過去の事例 → 標準書の改訂案</p>
      </header>
      <main>
        {tab === 'find' && (
          <Find
            cases={cases}
            onRegister={(ph, cause) => {
              setDraft({ ph, cause })
              go('cases')
            }}
          />
        )}
        {tab === 'cases' && <Cases cases={cases} setCases={setCases} onReset={() => { resetCases(); setCasesRaw(loadCases()) }} draft={draft} clearDraft={() => setDraft(null)} />}
        {tab === 'revise' && <Revise cases={cases} />}
      </main>
      <nav className="navBar no-print">
        <button className={tab === 'find' ? 'on' : ''} onClick={() => go('find')}>
          <b>原因を探す</b>
          <small>現象から調べる</small>
        </button>
        <button className={tab === 'cases' ? 'on' : ''} onClick={() => go('cases')}>
          <b>事例を見る・追加</b>
          <small>{cases.length}件</small>
        </button>
        <button className={tab === 'revise' ? 'on' : ''} onClick={() => go('revise')}>
          <b>標準書の改訂案</b>
          <small>A4で出力</small>
        </button>
      </nav>
    </div>
  )
}

/* ---------- 原因を探す ---------- */
function Find({ cases, onRegister }: { cases: Case[]; onRegister: (ph: string, cause: string) => void }) {
  const [ph, setPh] = useState<string | null>(null)
  const [ans, setAns] = useState<number[]>([])
  const phen = PHENS.find((p) => p.id === ph)

  if (!phen) {
    return (
      <section>
        <h2 className="qh">どんな現象が起きていますか？</h2>
        <p className="sub">いちばん近いものを1つ、タップしてください。3つの質問で、原因の候補が出ます。</p>
        <div className="phGrid">
          {PHENS.map((p) => (
            <button key={p.id} className="phBtn" onClick={() => { setPh(p.id); setAns([]) }}>
              <b>{p.name}</b>
              <span>{p.hint}</span>
              <em>過去の事例 {cases.filter((c) => c.ph === p.id).length}件</em>
            </button>
          ))}
        </div>
        <p className="note">原因の候補と点検の順番は、一般的な目安です。実際の現場では、自社の標準書と実績を優先してください。</p>
      </section>
    )
  }

  const step = ans.length
  const reset = () => { setPh(null); setAns([]) }

  if (step < phen.questions.length) {
    const qn = phen.questions[step]
    return (
      <section>
        <Ctx phen={phen.name} answers={ans.map((a, i) => phen.questions[i].options[a].label)} />
        <p className="prog">質問 {step + 1} / {phen.questions.length}</p>
        <h2 className="qh">{qn.text}</h2>
        <div className="chips col">
          {qn.options.map((o, i) => (
            <button key={o.label} className="chip" onClick={() => setAns([...ans, i])}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn ghost" onClick={() => (step === 0 ? reset() : setAns(ans.slice(0, -1)))}>
            ← {step === 0 ? '現象を選び直す' : '前の質問へ'}
          </button>
        </div>
      </section>
    )
  }

  return <Result phenId={phen.id} ans={ans} cases={cases} onBack={() => setAns(ans.slice(0, -1))} onReset={reset} onRegister={onRegister} />
}

function Ctx({ phen, answers }: { phen: string; answers: string[] }) {
  return (
    <div className="ctx">
      <div>
        <small>調べている現象</small>
        <b>{phen}</b>
      </div>
      {answers.map((a, i) => (
        <div key={i}>
          <small>答え {i + 1}</small>
          <b>{a}</b>
        </div>
      ))}
    </div>
  )
}

function Result(props: {
  phenId: string
  ans: number[]
  cases: Case[]
  onBack: () => void
  onReset: () => void
  onRegister: (ph: string, cause: string) => void
}) {
  const { phenId, ans, cases } = props
  const phen = PHENS.find((p) => p.id === phenId)!
  const ranked = useMemo(() => {
    const list = CAUSES.filter((c) => c.ph === phenId).map((c, order) => {
      let score = 0
      const hits: string[] = []
      ans.forEach((a, i) => {
        const o = phen.questions[i].options[a]
        const b = o.boost[c.id] ?? 0
        if (b > 0) {
          score += b
          hits.push(o.label)
        }
      })
      return { c, score, hits, order }
    })
    return list.sort((x, y) => y.score - x.score || x.order - y.order)
  }, [phenId, ans, phen])
  const top = ranked.slice(0, 3)
  const rest = ranked.slice(3)

  return (
    <section>
      <Ctx phen={phen.name} answers={ans.map((a, i) => phen.questions[i].options[a].label)} />
      <h2 className="qh">「{phen.name}」の原因の候補と、点検の順番</h2>
      <p className="sub">上から順に、疑う順番です。点検は、簡単なものから行ってください。</p>
      {top.map((r, i) => (
        <CauseCard key={r.c.id} rank={i + 1} c={r.c} hits={r.hits} cases={cases.filter((x) => x.cause === r.c.id)} open={i === 0} onRegister={props.onRegister} />
      ))}
      {rest.length > 0 && (
        <details className="more">
          <summary>ほかの可能性（{rest.length}件）を見る</summary>
          {rest.map((r, i) => (
            <CauseCard key={r.c.id} rank={top.length + i + 1} c={r.c} hits={r.hits} cases={cases.filter((x) => x.cause === r.c.id)} open={false} onRegister={props.onRegister} />
          ))}
        </details>
      )}
      <div className="row">
        <button className="btn ghost" onClick={props.onBack}>← 最後の質問へ戻る</button>
        <button className="btn" onClick={props.onReset}>ほかの現象を調べる</button>
      </div>
    </section>
  )
}

function CauseCard(props: {
  rank: number
  c: Cause
  hits: string[]
  cases: Case[]
  open: boolean
  onRegister: (ph: string, cause: string) => void
}) {
  const { c, cases } = props
  return (
    <details className="cause" open={props.open}>
      <summary>
        <span className="rank">優先 {props.rank}</span>
        <b>{c.name}</b>
        <small>過去の事例 {cases.length}件</small>
      </summary>
      <div className="causeBody">
        <p>{c.why}</p>
        {props.hits.length > 0 && (
          <p className="hit">
            あなたの答えで当てはまった所：{props.hits.map((h) => `「${h}」`).join('、')}
          </p>
        )}
        <h4>点検・調整の順番</h4>
        <ol className="checks">
          {c.checks.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
        <h4>過去の事例（{cases.length}件）</h4>
        {cases.length === 0 && <p className="sub">この原因の事例は、まだ登録されていません。</p>}
        {cases.map((x) => (
          <CaseCard key={x.id} c={x} compact />
        ))}
        <button className="btn small" onClick={() => props.onRegister(c.ph, c.id)}>
          この原因で、新しい事例を登録する
        </button>
      </div>
    </details>
  )
}

/* ---------- 事例カード ---------- */
function CaseCard({ c, compact, onStatus, onDelete }: { c: Case; compact?: boolean; onStatus?: (s: Status) => void; onDelete?: () => void }) {
  return (
    <article className={'case' + (compact ? ' compact' : '')}>
      <div className="caseHead">
        <span className={'badge ' + (c.kind === '不適合' ? 'ng' : 'hh')}>{c.kind}</span>
        <span className="date">{ymJa(c.date)}</span>
        <span className="mat">{c.material}</span>
        <span className={'st st-' + STATUSES.indexOf(c.status)}>標準書：{c.status}</span>
      </div>
      <p className="what">{c.what}</p>
      <dl>
        <dt>現象</dt>
        <dd>{phName(c.ph)}</dd>
        <dt>原因</dt>
        <dd>{causeName(c.cause)}{c.reason ? ` ― ${c.reason}` : ''}</dd>
        <dt>対策</dt>
        <dd>{c.measure || '—'}</dd>
      </dl>
      {onStatus && (
        <div className="caseTools no-print">
          <label>
            標準書への反映
            <select value={c.status} onChange={(e) => onStatus(e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {onDelete && (
            <button className="link" onClick={onDelete}>この事例を消す</button>
          )}
        </div>
      )}
    </article>
  )
}

/* ---------- 事例を見る・追加 ---------- */
function Cases(props: { cases: Case[]; setCases: (l: Case[]) => void; onReset: () => void; draft: Draft; clearDraft: () => void }) {
  const { cases, setCases } = props
  const [fph, setFph] = useState('all')
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(props.draft !== null)
  const [msg, setMsg] = useState('')
  const csvRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)

  const shown = cases.filter((c) => (fph === 'all' || c.ph === fph) && matches(c, text)).sort((a, b) => b.date.localeCompare(a.date))

  const add = (c: Case) => {
    setCases([c, ...cases])
    setAdding(false)
    props.clearDraft()
    setMsg('事例を登録しました。同じ原因の事例が重なると、「標準書の改訂案」に出ます。')
  }
  const readFile = (f: File | undefined, fn: (t: string) => void) => {
    if (!f) return
    const r = new FileReader()
    r.onload = () => fn(String(r.result))
    r.readAsText(f)
  }

  return (
    <section>
      <h2 className="qh">過去の事例（不適合・ヒヤリ・ハット）</h2>
      <p className="sub">会議で共有された新しい事例は、その場で登録できます。登録した事例は、原因を選ぶと「原因を探す」の結果にも出ます。</p>
      {msg && <p className="okMsg">{msg}</p>}
      <div className="row">
        <button className="btn" onClick={() => { setAdding(!adding); props.clearDraft() }}>
          {adding ? '登録をやめる' : '＋ 新しい事例を登録する'}
        </button>
      </div>
      {adding && <CaseForm draft={props.draft} onSave={add} onCancel={() => { setAdding(false); props.clearDraft() }} />}

      <div className="filters">
        <input className="search" type="search" placeholder="事例の言葉で探す（例：砥石、朝、バリ）" value={text} onChange={(e) => setText(e.target.value)} aria-label="事例を探す" />
        <div className="chips">
          <button className={'chip small' + (fph === 'all' ? ' on' : '')} onClick={() => setFph('all')}>すべて</button>
          {PHENS.map((p) => (
            <button key={p.id} className={'chip small' + (fph === p.id ? ' on' : '')} onClick={() => setFph(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <p className="count">{shown.length}件を表示</p>
      {shown.map((c) => (
        <CaseCard
          key={c.id}
          c={c}
          onStatus={(s) => setCases(cases.map((x) => (x.id === c.id ? { ...x, status: s } : x)))}
          onDelete={() => {
            if (window.confirm('この事例を消しますか？')) setCases(cases.filter((x) => x.id !== c.id))
          }}
        />
      ))}

      <details className="more tools">
        <summary>データの書き出し・読み込み・見本に戻す</summary>
        <p className="sub">事例は、この端末のブラウザの中だけに保存されています。外には送られません。端末を変えるときは、書き出して持っていけます。</p>
        <div className="row wrap">
          <button className="btn small" onClick={() => download('事例一覧.csv', toCsv(cases), 'text/csv;charset=utf-8')}>CSVで書き出す（Excelで開けます）</button>
          <button className="btn small" onClick={() => download('事例バックアップ.json', JSON.stringify(cases, null, 1), 'application/json')}>JSONで書き出す（バックアップ）</button>
        </div>
        <div className="row wrap">
          <button className="btn small ghost" onClick={() => csvRef.current?.click()}>CSVから読み込む</button>
          <button className="btn small ghost" onClick={() => jsonRef.current?.click()}>JSONから読み込む</button>
          <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => {
            readFile(e.target.files?.[0], (t) => {
              const r = fromCsv(t)
              if (r.cases.length) setCases([...r.cases, ...cases])
              setMsg(`CSVから${r.cases.length}件を取り込みました。${r.skipped ? `読めなかった行が${r.skipped}件あります（発生年月は「2025-06」の形、種別と現象は書き出したCSVと同じ言葉にしてください）。` : ''}`)
            })
            e.target.value = ''
          }} />
          <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={(e) => {
            readFile(e.target.files?.[0], (t) => {
              try {
                const v = JSON.parse(t)
                if (!Array.isArray(v)) throw new Error('x')
                const got = (v as unknown[]).filter(isCase)
                const ids = new Set(cases.map((c) => c.id))
                const add = got.filter((c) => !ids.has(c.id))
                setCases([...add, ...cases])
                setMsg(`JSONから${add.length}件を取り込みました。`)
              } catch {
                setMsg('このファイルは読み込めませんでした。書き出したJSONを選んでください。')
              }
            })
            e.target.value = ''
          }} />
        </div>
        {isSaved() && (
          <div className="row">
            <button className="link" onClick={() => {
              if (window.confirm('登録した事例を消して、見本の事例に戻します。よろしいですか？')) {
                props.onReset()
                setMsg('見本の事例に戻しました。')
              }
            }}>見本の事例に戻す</button>
          </div>
        )}
      </details>
    </section>
  )
}
function matches(c: Case, t: string) {
  const s = t.trim()
  if (!s) return true
  return [c.what, c.reason, c.measure, c.material, causeName(c.cause), phName(c.ph)].some((x) => x.includes(s))
}

function CaseForm({ draft, onSave, onCancel }: { draft: Draft; onSave: (c: Case) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<Kind>('不適合')
  const [date, setDate] = useState(ym())
  const [ph, setPh] = useState(draft?.ph ?? PHENS[0].id)
  const [cause, setCause] = useState(draft?.cause ?? OTHER)
  const [material, setMaterial] = useState('')
  const [what, setWhat] = useState('')
  const [reason, setReason] = useState('')
  const [measure, setMeasure] = useState('')
  const [status, setStatus] = useState<Status>('未反映')
  const [err, setErr] = useState('')
  const causes = CAUSES.filter((c) => c.ph === ph)

  const save = () => {
    if (!what.trim()) {
      setErr('「何が起きたか」を書いてください。')
      return
    }
    onSave({ id: newId(), date, kind, ph, cause, material: material.trim(), what: what.trim(), reason: reason.trim(), measure: measure.trim(), status })
  }
  return (
    <div className="form">
      <h3>新しい事例を登録</h3>
      <div className="seg">
        {KINDS.map((k) => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k}</button>
        ))}
      </div>
      <label>
        いつ起きましたか（年月）
        <input type="month" value={date} onChange={(e) => setDate(e.target.value || ym())} />
      </label>
      <label>
        どの現象ですか
        <select value={ph} onChange={(e) => { setPh(e.target.value); setCause(OTHER) }}>
          {PHENS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <label>
        原因（「原因を探す」の候補と結びつけます）
        <select value={cause} onChange={(e) => setCause(e.target.value)}>
          {causes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value={OTHER}>原因が未特定・どれでもない</option>
        </select>
      </label>
      <label>
        材質
        <input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="例：焼入れ鋼" />
      </label>
      <label>
        何が起きたか（必須）
        <textarea value={what} onChange={(e) => setWhat(e.target.value)} rows={3} placeholder="例：角に小さな欠けが出た" />
      </label>
      <label>
        原因の詳しい内容
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </label>
      <label>
        対策
        <textarea value={measure} onChange={(e) => setMeasure(e.target.value)} rows={2} />
      </label>
      <label>
        作業標準書への反映
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {err && <p className="err">{err}</p>}
      <div className="row">
        <button className="btn" onClick={save}>登録する</button>
        <button className="btn ghost" onClick={onCancel}>やめる</button>
      </div>
    </div>
  )
}

/* ---------- 標準書の改訂案 ---------- */
function Revise({ cases }: { cases: Case[] }) {
  const [min, setMin] = useState(2)
  const groups = useMemo(() => {
    const m = new Map<string, Case[]>()
    for (const c of cases) {
      if (c.cause === OTHER) continue
      m.set(c.cause, [...(m.get(c.cause) ?? []), c])
    }
    return [...m.entries()]
      .map(([id, list]) => ({ c: causeOf(id), list, open: list.filter((x) => x.status !== '反映済').length }))
      .filter((g): g is { c: Cause; list: Case[]; open: number } => !!g.c && g.list.length >= min && g.open > 0)
      .sort((a, b) => b.open - a.open || b.list.length - a.list.length)
  }, [cases, min])
  const today = new Date()
  const days = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`

  return (
    <section className="sheet">
      <div className="no-print">
        <h2 className="qh">作業標準書の改訂ポイント案</h2>
        <p className="sub">同じ原因が重なっていて、まだ標準書に反映されていない所を、自動でまとめます。</p>
        <label className="minSel">
          何件以上、同じ原因が重なったら出しますか
          <select value={min} onChange={(e) => setMin(Number(e.target.value))}>
            <option value={2}>2件以上</option>
            <option value={3}>3件以上</option>
          </select>
        </label>
        <div className="row">
          <button className="btn" onClick={() => window.print()} disabled={groups.length === 0}>A4で印刷・PDF保存</button>
        </div>
      </div>
      <div className="printHead">
        <h2>作業標準書 改訂ポイント案</h2>
        <p>作成日：{days}　／　対象の事例：{cases.length}件　／　改訂ポイント：{groups.length}件</p>
      </div>
      {groups.length === 0 && <p className="sub">いまは、改訂の案はありません。事例が増えると、ここに出ます。</p>}
      {groups.map((g, i) => (
        <article key={g.c.id} className="rev">
          <h3>
            <span className="rank">{i + 1}</span>
            {g.c.name}
            <small>（{phName(g.c.ph)}）</small>
          </h3>
          <p className="revMeta">同じ原因の事例：{g.list.length}件（うち、標準書に未反映・検討中：{g.open}件）／ 関わる標準書の項目：{g.c.item}</p>
          <p className="revText"><b>改訂案：</b>{g.c.revise}</p>
          <ul className="revCases">
            {g.list.sort((a, b) => a.date.localeCompare(b.date)).map((x) => (
              <li key={x.id}>
                {ymJa(x.date)}［{x.kind}］{x.what}　対策：{x.measure || '—'}　<span className={'st st-' + STATUSES.indexOf(x.status)}>{x.status}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
      <p className="note">この案は、事例の数から機械的にまとめたものです。標準書への反映は、会議で内容を確かめてから決めてください。</p>
    </section>
  )
}
