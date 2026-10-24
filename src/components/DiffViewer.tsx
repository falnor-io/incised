import { Fragment, useMemo, useState } from 'react'
import { countChanges, diffSeq, numberLines, splitWords, toSegments, type DiffLine, type Segment } from './diff.js'
import { useCopy } from './hooks.js'
import { cx } from './util.js'

export type DiffFile = { path: string; before: string; after: string }
export type DiffComment = { path: string; line: number; author: string; text: string }
export type DiffViewerProps = { title: string; files: DiffFile[]; comments?: DiffComment[]; context?: number; defaultMode?: 'split' | 'unified'; className?: string }

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
export function DiffViewer({ title, files, comments = [], context = 3, defaultMode = 'split', className }: DiffViewerProps) {
  const [mode, setMode] = useState<'split' | 'unified'>(defaultMode)
  const [open, setOpen] = useState<Set<string>>(() => new Set(files.map((f) => f.path)))
  const [viewed, setViewed] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedLine, setSelectedLine] = useState<string | null>(null)
  const [copied, copy] = useCopy()

  const parsed = useMemo(
    () =>
      files.map((f) => {
        const a = f.before === '' ? [] : f.before.split('\n')
        const b = f.after === '' ? [] : f.after.split('\n')
        if (a.length > MAX_LINES || b.length > MAX_LINES) return { file: f, tooBig: true as const, lines: [] as DiffLine[], segments: [] as Segment[], added: 0, removed: 0 }
        const lines = numberLines(diffSeq(a, b))
        return { file: f, tooBig: false as const, lines, segments: toSegments(lines, context), ...countChanges(lines) }
      }),
    [files, context],
  )
  const totals = parsed.reduce((t, p) => ({ added: t.added + p.added, removed: t.removed + p.removed }), { added: 0, removed: 0 })
  const toggle = (set: Set<string>, key: string, fn: (s: Set<string>) => void) => { const n = new Set(set); if (!n.delete(key)) n.add(key); fn(n) }

  return (
    <section className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <div>
          <h3 className="ol-title" style={{ margin: 0 }}>{title}</h3>
          <div className="ol-sub">{files.length} {files.length === 1 ? 'file' : 'files'} changed · <b className="ol-add">+{totals.added}</b> <b className="ol-del">−{totals.removed}</b> <StatBar {...totals} /></div>
        </div>
        <div className="ol-tabs" role="tablist" aria-label="Diff layout">
          <button type="button" role="tab" className="ol-tab" aria-selected={mode === 'split'} onClick={() => setMode('split')}>Split</button>
          <button type="button" role="tab" className="ol-tab" aria-selected={mode === 'unified'} onClick={() => setMode('unified')}>Unified</button>
        </div>
      </div>

      <div className="ol-diffv-body">
        {files.length > 1 && (
          <nav className="ol-ftree" aria-label="Changed files">
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
                  <span className="ol-mono"><b className="ol-add">+{p.added}</b> <b className="ol-del">−{p.removed}</b></span>
                  <StatBar added={p.added} removed={p.removed} />
                  <label className="ol-viewed"><input type="checkbox" checked={viewed.has(p.file.path)} onChange={() => toggle(viewed, p.file.path, setViewed)} /> Viewed</label>
                </div>
                {isOpen && (p.tooBig ? <p className="ol-sub" style={{ padding: 12 }}>Too long to compare here (over {MAX_LINES} lines). Diff it before passing it in.</p>
                  : p.added + p.removed === 0 ? <p className="ol-sub" style={{ padding: 12 }}>No differences.</p>
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
                            return <Fragment key={`g${si}`}>{renderRows(seg.lines, mode, p.file.path, fileComments, selectedLine, setSelectedLine)}</Fragment>
                          }
                          return (
                            <Fragment key={`h${si}`}>
                              <tr className="ol-hunk"><td colSpan={mode === 'split' ? 6 : 4} className="ol-mono">{seg.header}</td></tr>
                              {renderRows(seg.lines, mode, p.file.path, fileComments, selectedLine, setSelectedLine)}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  ))}
                {!isOpen && viewed.has(p.file.path) && <p className="ol-sub" style={{ padding: '6px 12px', margin: 0 }}>Marked as viewed.</p>}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function renderRows(lines: DiffLine[], mode: 'split' | 'unified', path: string, comments: DiffComment[], selected: string | null, select: (k: string | null) => void) {
  const commentsFor = (l?: DiffLine) => (l?.newNo !== undefined ? comments.filter((c) => c.line === l.newNo) : [])
  const cell = (l: DiffLine | undefined, side: 'old' | 'new', other: DiffLine | undefined) => {
    if (!l) return [<td key="n" className="ol-ln" />, <td key="s" className="ol-sign" />, <td key="c" className="ol-code" data-kind="empty" />]
    const no = side === 'old' ? l.oldNo : l.newNo
    const key = `${path}:${side}${no}`
    const paired = other && other.type !== 'same' && l.type !== 'same' && other.type !== l.type
    return [
      <td key="n" className="ol-ln" data-active={selected === key} onClick={() => select(selected === key ? null : key)} aria-label={`Line ${no}`}>{no}</td>,
      <td key="s" className="ol-sign" data-kind={l.type}>{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ''}</td>,
      <td key="c" className="ol-code ol-mono" data-kind={l.type} data-active={selected === key}>
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
          <td className="ol-ln" data-active={selected === key} onClick={() => select(selected === key ? null : key)}>{l.newNo ?? ''}</td>
          <td className="ol-sign" data-kind={l.type}>{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ''}</td>
          <td className="ol-code ol-mono" data-kind={l.type} data-active={selected === key}>{l.text || ' '}</td>
        </tr>
        {commentRow(l, 4, String(i))}
      </Fragment>
    )
  })
}
