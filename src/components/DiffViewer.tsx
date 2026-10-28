'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { authorOf, authorship, countChanges, diffSeq, markMoves, numberLines, splitWords, toSegments, type AuthorRange, type DiffLine, type Segment } from './diff.js'
import { canonical, sha256Hex } from '../verify/canonical.js'
import { useCopy } from './hooks.js'
import { cx } from './util.js'

export type DiffFile = {
  path: string
  before: string
  after: string
  /** Who wrote which added lines, by line number in the new file. A line no range covers is shown as unknown, never assumed. */
  authors?: AuthorRange[]
}
export type HunkDecision = 'accept' | 'reject'
export type DiffComment = { path: string; line: number; author: string; text: string }
export type DiffViewerProps = {
  title: string
  files: DiffFile[]
  comments?: DiffComment[]
  context?: number
  defaultMode?: 'split' | 'unified'
  /** `salience` lists the files with the most real change first, so a reviewer starts where it matters. Moved code does not count. */
  order?: 'given' | 'salience'
  /** Adds accept and reject on each hunk. Each decision is tied to a digest of the file, so it stops counting once the file changes. */
  onDecideHunk?: (path: string, hunk: number, decision: HunkDecision, digest: string) => void
  /** Called when a file is marked viewed or not, with the digest of what was viewed. */
  onView?: (path: string, viewed: boolean, digest: string) => void
  className?: string
}

const MAX_LINES = 2000

type Row = { left?: DiffLine; right?: DiffLine }
function pairRows(lines: DiffLine[]): Row[] {
  const rows: Row[] = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]!
    if (l.type === 'same') { rows.push({ left: l, right: l }); i++; continue }
    const dels: DiffLine[] = []
    const adds: DiffLine[] = []
    while (lines[i]?.type === 'del') dels.push(lines[i++]!)
    while (lines[i]?.type === 'add') adds.push(lines[i++]!)
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ left: dels[k], right: adds[k] })
  }
  return rows
}

function Words({ text, other, side }: { text: string; other: string; side: 'del' | 'add' }) {
  const ops = diffSeq(splitWords(side === 'del' ? text : other), splitWords(side === 'del' ? other : text))
  const show = side === 'del' ? ops.filter((o) => o.type !== 'add') : ops.filter((o) => o.type !== 'del')
  const changed = show.map((o, i) => o.type !== 'same' || (/^\s+$/.test(o.text) && i > 0 && i < show.length - 1 && show[i - 1]!.type !== 'same' && show[i + 1]!.type !== 'same'))
  const out: { text: string; changed: boolean }[] = []
  show.forEach((o, i) => {
    const last = out[out.length - 1]
    if (last && last.changed === changed[i]) last.text += o.text
    else out.push({ text: o.text, changed: changed[i]! })
  })
  return <>{out.map((o, i) => (o.changed ? <mark key={i} className="ol-word" data-kind={side}>{o.text}</mark> : <span key={i}>{o.text}</span>))}</>
}

/** Five squares, green for the share of changes that are additions, like a pull request header. */
function StatBar({ added, removed }: { added: number; removed: number }) {
  const total = added + removed
  const green = total === 0 ? 0 : Math.round((added / total) * 5)
  return (
    <span className="ol-statbar" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => <i key={i} data-k={total === 0 ? 'none' : i < green ? 'add' : 'del'} />)}
    </span>
  )
}

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '')
const baseOf = (p: string) => p.slice(p.lastIndexOf('/') + 1)

/**
 * A review-grade diff for policies, prompts and outputs: file list with change counts, hunk headers, old and
 * new line numbers, unchanged stretches folded until you ask, changed words marked inside changed lines, side
 * by side or one column, and reviewer comments pinned to lines.
 */
export function DiffViewer({ title, files, comments = [], context = 3, defaultMode = 'split', order = 'given', onDecideHunk, onView, className }: DiffViewerProps) {
  const [mode, setMode] = useState<'split' | 'unified'>(defaultMode)
  const [open, setOpen] = useState<Set<string>>(() => new Set(files.map((f) => f.path)))
  const [viewed, setViewed] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedLine, setSelectedLine] = useState<string | null>(null)
  const [copied, copy] = useCopy()

  const parsed = useMemo(() => {
    const raw = files.map((f) => {
      const a = f.before === '' ? [] : f.before.split('\n')
      const b = f.after === '' ? [] : f.after.split('\n')
      return a.length > MAX_LINES || b.length > MAX_LINES ? null : numberLines(diffSeq(a, b))
    })
    const marked = markMoves(raw.map((l) => l ?? []))
    const list = files.map((f, i) => {
      if (raw[i] === null) return { file: f, tooBig: true as const, lines: [] as DiffLine[], segments: [] as Segment[], added: 0, removed: 0, moved: 0, by: { agent: 0, human: 0, unknown: 0 } }
      const lines = marked[i]!
      return { file: f, tooBig: false as const, lines, segments: toSegments(lines, context), ...countChanges(lines), by: authorship(lines, f.authors) }
    })
    return order === 'salience' ? [...list].sort((x, y) => y.added + y.removed - (x.added + x.removed)) : list
  }, [files, context, order])
  const [digests, setDigests] = useState<Record<string, string>>({})
  const [hunks, setHunks] = useState<Record<string, HunkDecision>>({})
  useEffect(() => {
    let live = true
    Promise.all(files.map(async (f) => [f.path, (await sha256Hex(canonical({ path: f.path, before: f.before, after: f.after }))).slice(0, 12)] as const)).then((p) => { if (live) setDigests(Object.fromEntries(p)) })
    return () => { live = false }
  }, [files])
  const totals = parsed.reduce((t, p) => ({ added: t.added + p.added, removed: t.removed + p.removed, moved: t.moved + p.lines.filter((l) => l.type === 'add' && l.moved).length }), { added: 0, removed: 0, moved: 0 })
  const toggle = (set: Set<string>, key: string, fn: (s: Set<string>) => void) => { const n = new Set(set); if (!n.delete(key)) n.add(key); fn(n) }

  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <div>
          <h3 className="ol-title">{title}</h3>
          <div className="ol-sub">{files.length} {files.length === 1 ? 'file' : 'files'} changed · <b className="ol-add">+{totals.added}</b> <b className="ol-del">−{totals.removed}</b>{totals.moved > 0 && <span title="Lines removed in one place and added in another, unchanged"> · {totals.moved} moved, not rewritten</span>} <StatBar added={totals.added} removed={totals.removed} /></div>
        </div>
        <div className="ol-tabs" role="tablist" aria-label="Diff layout">
          <button type="button" role="tab" className="ol-tab" aria-selected={mode === 'split'} onClick={() => setMode('split')}>Split</button>
          <button type="button" role="tab" className="ol-tab" aria-selected={mode === 'unified'} onClick={() => setMode('unified')}>Unified</button>
        </div>
      </div>

      <div className="ol-diffv-body">
        {files.length > 1 && (
          <nav className="ol-ftree" aria-label={`Changed files, ${title}`}>
            {parsed.map((p) => (
              <a key={p.file.path} href={`#diff-${encodeURIComponent(p.file.path)}`} onClick={() => setOpen((o) => new Set(o).add(p.file.path))}>
                <span className="ol-ell"><span className="ol-sub">{dirOf(p.file.path)}</span>{baseOf(p.file.path)}</span>
                <span className="ol-fcount"><b className="ol-add">+{p.added}</b> <b className="ol-del">−{p.removed}</b></span>
              </a>
            ))}
          </nav>
        )}
        <div className="ol-files">
          {parsed.map((p) => {
            const isOpen = open.has(p.file.path) && !viewed.has(p.file.path)
            const fileComments = comments.filter((c) => c.path === p.file.path)
            return (
              <div className="ol-file" key={p.file.path} id={`diff-${encodeURIComponent(p.file.path)}`}>
                <div className="ol-file-head">
                  <button type="button" className="ol-twist" aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${p.file.path}`} onClick={() => toggle(open, p.file.path, setOpen)}>{isOpen ? '▾' : '▸'}</button>
                  <span className="ol-mono ol-ell"><span className="ol-sub">{dirOf(p.file.path)}</span><b>{baseOf(p.file.path)}</b></span>
                  <button type="button" className="ol-linkbtn ol-sub" onClick={() => copy(p.file.path)}>{copied ? 'copied' : 'copy path'}</button>
                  <span className="ol-spacer" />
                  <span className="ol-mono"><b className="ol-add">+{p.added}</b> <b className="ol-del">−{p.removed}</b>{p.moved > 0 && <span className="ol-sub"> ~{p.moved}</span>}</span>
                  <StatBar added={p.added} removed={p.removed} />
                  {p.by.agent + p.by.human > 0 && <span className="ol-sub" title={`${p.by.agent} agent, ${p.by.human} person, ${p.by.unknown} unknown`}>{Math.round((p.by.agent / (p.by.agent + p.by.human + p.by.unknown)) * 100)}% agent</span>}
                  <label className="ol-viewed"><input type="checkbox" checked={viewed.has(p.file.path)} onChange={() => { onView?.(p.file.path, !viewed.has(p.file.path), digests[p.file.path] ?? ''); toggle(viewed, p.file.path, setViewed) }} /> Viewed</label>
                </div>
                {isOpen && (p.tooBig ? <p className="ol-sub ol-filenote">Too long to compare here (over {MAX_LINES} lines). Diff it before passing it in.</p>
                  : p.added + p.removed + p.moved === 0 ? <p className="ol-sub ol-filenote">No differences.</p>
                  : (
                    <table className="ol-dtable" data-mode={mode}>
                      <colgroup>
                        {mode === 'split'
                          ? [<col key="a" className="ol-c-ln" />, <col key="b" className="ol-c-sign" />, <col key="c" />, <col key="d" className="ol-c-ln" />, <col key="e" className="ol-c-sign" />, <col key="f" />]
                          : [<col key="a" className="ol-c-ln" />, <col key="b" className="ol-c-ln" />, <col key="c" className="ol-c-sign" />, <col key="d" />]}
                      </colgroup>
                      <tbody>
                        {p.segments.map((seg, si) => {
                          if (seg.kind === 'gap') {
                            const key = `${p.file.path}:${seg.id}`
                            if (!expanded.has(key)) {
                              return (
                                <tr className="ol-gap" key={`g${si}`}>
                                  <td colSpan={mode === 'split' ? 6 : 4}>
                                    <button type="button" onClick={() => toggle(expanded, key, setExpanded)}>Show {seg.lines.length} unchanged {seg.lines.length === 1 ? 'line' : 'lines'}</button>
                                  </td>
                                </tr>
                              )
                            }
                            return <Fragment key={`g${si}`}>{renderRows(seg.lines, mode, p.file.path, fileComments, selectedLine, setSelectedLine, p.file.authors)}</Fragment>
                          }
                          return (
                            <Fragment key={`h${si}`}>
                              <tr className="ol-hunk"><td colSpan={mode === 'split' ? 6 : 4} className="ol-mono">
                                {seg.header}
                                {onDecideHunk && digests[p.file.path] && (() => {
                                  const hk = `${digests[p.file.path]}:${si}`
                                  const dec = hunks[hk]
                                  const decide = (d: HunkDecision) => { setHunks((h) => ({ ...h, [hk]: d })); onDecideHunk(p.file.path, si, d, digests[p.file.path]!) }
                                  return (
                                    <span className="ol-hunkbtns">
                                      <button type="button" className="ol-linkbtn" aria-pressed={dec === 'accept'} onClick={() => decide('accept')}>Accept</button>
                                      <button type="button" className="ol-linkbtn" aria-pressed={dec === 'reject'} onClick={() => decide('reject')}>Reject</button>
                                      {dec && <span className="ol-sub"> {dec === 'accept' ? 'accepted' : 'rejected'}</span>}
                                    </span>
                                  )
                                })()}
                              </td></tr>
                              {renderRows(seg.lines, mode, p.file.path, fileComments, selectedLine, setSelectedLine, p.file.authors)}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  ))}
                {!isOpen && viewed.has(p.file.path) && <p className="ol-sub ol-filenote">Marked as viewed.</p>}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function renderRows(lines: DiffLine[], mode: 'split' | 'unified', path: string, comments: DiffComment[], selected: string | null, select: (k: string | null) => void, authors?: AuthorRange[]) {
  const commentsFor = (l?: DiffLine) => (l?.newNo !== undefined ? comments.filter((c) => c.line === l.newNo) : [])
  const cell = (l: DiffLine | undefined, side: 'old' | 'new', other: DiffLine | undefined) => {
    if (!l) return [<td key="n" className="ol-ln" />, <td key="s" className="ol-sign" />, <td key="c" className="ol-code" data-kind="empty" />]
    const no = side === 'old' ? l.oldNo : l.newNo
    const key = `${path}:${side}${no}`
    const paired = other && other.type !== 'same' && l.type !== 'same' && other.type !== l.type
    return [
      <td key="n" className="ol-ln" data-active={selected === key} data-author={authorOf(l, authors)?.kind} title={authorOf(l, authors) ? `Written by ${authorOf(l, authors)!.by}` : undefined} onClick={() => select(selected === key ? null : key)} aria-label={`Line ${no}`}>{no}</td>,
      <td key="s" className="ol-sign" data-kind={l.type}>{l.moved ? '~' : l.type === 'add' ? '+' : l.type === 'del' ? '−' : ''}</td>,
      <td key="c" className="ol-code ol-mono" data-kind={l.type} data-moved={l.moved} data-active={selected === key}>
        {paired ? <Words text={l.text} other={other!.text} side={l.type as 'add' | 'del'} /> : l.text || ' '}
      </td>,
    ]
  }
  const commentRow = (l: DiffLine | undefined, span: number, k: string) => commentsFor(l).map((c, i) => (
    <tr className="ol-comment-row" key={`${k}c${i}`}>
      <td colSpan={span}><div className="ol-comment"><b>{c.author}</b> <span className="ol-sub">commented on line {c.line}</span><div>{c.text}</div></div></td>
    </tr>
  ))

  if (mode === 'split') {
    return pairRows(lines).map((r, i) => (
      <Fragment key={i}>
        <tr>{cell(r.left, 'old', r.right)}{cell(r.right, 'new', r.left)}</tr>
        {commentRow(r.right, 6, String(i))}
      </Fragment>
    ))
  }
  return lines.map((l, i) => {
    const key = `${path}:u${i}`
    return (
      <Fragment key={i}>
        <tr>
          <td className="ol-ln">{l.oldNo ?? ''}</td>
          <td className="ol-ln" data-active={selected === key} data-author={authorOf(l, authors)?.kind} title={authorOf(l, authors) ? `Written by ${authorOf(l, authors)!.by}` : undefined} onClick={() => select(selected === key ? null : key)}>{l.newNo ?? ''}</td>
          <td className="ol-sign" data-kind={l.type}>{l.moved ? '~' : l.type === 'add' ? '+' : l.type === 'del' ? '−' : ''}</td>
          <td className="ol-code ol-mono" data-kind={l.type} data-moved={l.moved} data-active={selected === key}>{l.text || ' '}</td>
        </tr>
        {commentRow(l, 4, String(i))}
      </Fragment>
    )
  })
}
