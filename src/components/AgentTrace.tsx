import { useMemo, useState } from 'react'
import type { AgentTraceProps, TraceSpan } from '../schemas.js'
import { cx } from './util.js'

type Node = { span: TraceSpan; depth: number; children: Node[] }

/** Builds the tree. Spans with a missing parent become roots, and a cycle is cut rather than looped on. */
export function buildTraceTree(spans: TraceSpan[]): Node[] {
  const byId = new Map(spans.map((s) => [s.id, s]))
  const kids = new Map<string, TraceSpan[]>()
  const roots: TraceSpan[] = []
  for (const s of spans) {
    if (s.parentId && s.parentId !== s.id && byId.has(s.parentId)) kids.set(s.parentId, [...(kids.get(s.parentId) ?? []), s])
    else roots.push(s)
  }
  const seen = new Set<string>()
  const walk = (s: TraceSpan, depth: number): Node => {
    seen.add(s.id)
    const children = (kids.get(s.id) ?? []).filter((c) => !seen.has(c.id)).sort((a, b) => a.startMs - b.startMs).map((c) => walk(c, depth + 1))
    return { span: s, depth, children }
  }
  const tree = roots.sort((a, b) => a.startMs - b.startMs).map((r) => walk(r, 0))
  // Anything unreachable (a pure cycle) is shown as a root so no span silently disappears.
  for (const s of spans) if (!seen.has(s.id)) tree.push(walk(s, 0))
  return tree
}

const flatten = (nodes: Node[], collapsed: Set<string>): Node[] =>
  nodes.flatMap((n) => [n, ...(collapsed.has(n.span.id) ? [] : flatten(n.children, collapsed))])

const KIND_LABEL = { llm: 'Model', tool: 'Tool', retrieval: 'Lookup', gate: 'Gate', human: 'Person' } as const

/** A waterfall of what an agent did. Totals and error counts are computed from the spans. */
export function AgentTrace({ title, spans, className }: AgentTraceProps & { className?: string }) {
  const tree = useMemo(() => buildTraceTree(spans), [spans])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const rows = flatten(tree, collapsed)
  const end = Math.max(...spans.map((s) => s.startMs + s.durationMs), 1)
  const errors = spans.filter((s) => s.status === 'error').length
  const blocked = spans.filter((s) => s.status === 'blocked').length
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  return (
    <section className={cx('ic', className)} aria-label={title}>
      <div className="ic-head-row">
        <h3 className="ic-title" style={{ margin: 0 }}>{title}</h3>
        <span className="ic-sub">
          {spans.length} spans · {(end / 1000).toFixed(2)}s
          {errors > 0 && ` · ${errors} failed`}
          {blocked > 0 && ` · ${blocked} blocked by a gate`}
        </span>
      </div>
      <ul className="ic-list">
        {rows.map(({ span, depth, children }) => (
          <li className="ic-span" key={span.id} data-status={span.status} style={{ paddingLeft: depth * 16 }}>
            <div className="ic-span-name">
              {children.length > 0 ? (
                <button type="button" className="ic-twist" onClick={() => toggle(span.id)} aria-expanded={!collapsed.has(span.id)} aria-label={`${collapsed.has(span.id) ? 'Expand' : 'Collapse'} ${span.name}`}>
                  {collapsed.has(span.id) ? '▸' : '▾'}
                </button>
              ) : (
                <span className="ic-twist" aria-hidden="true" />
              )}
              <span className="ic-kind">{KIND_LABEL[span.kind]}</span>
              <span>{span.name}</span>
            </div>
            <div className="ic-wf" role="img" aria-label={`${span.name}: starts at ${span.startMs} ms, lasts ${span.durationMs} ms, ${span.status}`}>
              <span style={{ left: `${(span.startMs / end) * 100}%`, width: `${Math.max((span.durationMs / end) * 100, 0.6)}%` }} />
            </div>
            <span className="ic-mono ic-sub">{span.durationMs} ms</span>
            {span.detail && <div className="ic-sub ic-span-detail">{span.detail}</div>}
          </li>
        ))}
      </ul>
    </section>
  )
}
