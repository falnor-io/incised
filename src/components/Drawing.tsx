'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { ApprovalChain } from './ApprovalChain.js'
import { BudgetMeter } from './BudgetMeter.js'
import { DiffViewer } from './DiffViewer.js'
import { FlowCanvas } from './FlowCanvas.js'
import { PlanVsActual } from './PlanVsActual.js'
import { RunBranches } from './RunBranches.js'
import { RunInspector } from './RunInspector.js'
import { RunVariants } from './RunVariants.js'
import { Sankey } from './Sankey.js'
import { useSource, type OrluneSources, type SourceKind } from './SourcesContext.js'
import { ControlChart } from './ControlChart.js'
import { TraceExplorer } from './TraceExplorer.js'
import { gateFor, type Status } from './status.js'
import { cx } from './util.js'

type Opts = { playable: boolean; param?: string; status?: Status }

// lint-allow(no-any): each entry is keyed by its own source kind, and the lookup below pairs a kind with data of that kind.
const DRAW: Partial<Record<SourceKind, (d: any, title: string, o: Opts) => ReactNode>> = {
  traces: (spans, title) => <TraceExplorer title={title} spans={spans} />,
  flows: (d, title, o) => <FlowCanvas title={title} nodes={d.nodes} edges={d.edges} playable={o.playable} param={o.param} status={o.status} />,
  rates: (d, title) => <ControlChart title={title} data={d.data} baseline={d.baseline} />,
  sankeys: (d, title, o) => <Sankey title={title} nodes={d.nodes} links={d.links} unit={d.unit} playable={o.playable} param={o.param} status={o.status} />,
  chains: (d, title, o) => <ApprovalChain title={title} requester={d.requester} startedAt={d.startedAt} steps={d.steps} decisions={d.decisions} now={d.now} playable={o.playable} param={o.param} status={o.status} />,
  plans: (d, title) => <PlanVsActual title={title} plan={d.plan} actual={d.actual} />,
  budgets: (d, title) => <BudgetMeter title={title} {...d} />,
  runs: (d, title) => <RunInspector title={title} spans={d.spans} plan={d.plan} actual={d.actual} evidence={d.evidence} />,
  branches: (cps, title) => <RunBranches title={title} checkpoints={cps} />,
  variants: (d, title) => <RunVariants title={title} runs={d.runs} plan={d.plan} />,
  diffs: (files, title) => <DiffViewer title={title} files={files} />,
}

/** The source kinds `Drawing` can show. */
export const DRAWABLE_KINDS = Object.keys(DRAW) as SourceKind[]

/** One of your sources drawn by the component built for it. The data comes from SourcesProvider, never from the caller. */
export function Drawing({ kind, source, title, playable = false, param, status, className }: { kind: keyof OrluneSources; source: string; title: string; playable?: boolean; param?: string; status?: Status; className?: string }) {
  const data = useSource(kind, source)
  const draw = DRAW[kind]
  const gate = data === undefined ? gateFor(status, { title, className }) : null
  if (gate) return <div className={className}>{gate}</div>
  if (!draw || data === undefined) return <p className={cx('ol ol-sub', className)}>No drawing for "{source}".</p>
  // Once the record is here the skeleton has done its job; a partial record still shows its note.
  return <div className={className}>{draw(data, title, { playable, param, status: status === 'loading' ? undefined : status })}</div>
}

export type Answer = { kind: SourceKind; source: string; title: string }

/**
 * A question box that answers with a drawing. `resolve` is yours: it can call a model that is told only the ids from
 * `describeSources`. What comes back is a kind and an id, so the model chooses which of your records to draw and cannot
 * write a figure of its own.
 */
export function Ask({ resolve, placeholder = 'Ask about a run, an approval or a flow', className }: { resolve: (question: string) => Promise<Answer | null>; placeholder?: string; className?: string }) {
  const [q, setQ] = useState('')
  const [state, setState] = useState<{ status: 'idle' | 'thinking' | 'none' | 'error' } | { status: 'done'; answer: Answer }>({ status: 'idle' })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!q.trim()) return
    setState({ status: 'thinking' })
    try {
      const answer = await resolve(q.trim())
      setState(answer && DRAW[answer.kind] ? { status: 'done', answer } : { status: 'none' })
    } catch {
      setState({ status: 'error' })
    }
  }
  return (
    <section role="group" className={cx('ol', className)} aria-label="Ask">
      <form className="ol-ask" onSubmit={submit}>
        <input className="ol-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Question" />
        <button type="submit" className="ol-btn" disabled={state.status === 'thinking'}>Ask</button>
      </form>
      <div aria-live="polite" className="ol-mt-3">
        {state.status === 'thinking' && <p className="ol-sub">Looking through the records</p>}
        {state.status === 'none' && <p className="ol-sub">None of the records answer that.</p>}
        {state.status === 'error' && <p className="ol-sub ol-text-bad">That did not work. Try again.</p>}
        {state.status === 'done' && <Drawing {...state.answer} playable />}
      </div>
    </section>
  )
}
