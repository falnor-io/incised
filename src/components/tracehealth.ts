// Rules for whether a trace is worth reading. The point of each: a trace is easy to debug when each model call is
// its own step, tool calls sit under the step that asked for them, and names are stable. These are the things
// Langfuse's "what does a good trace look like" asks you to check by eye, turned into checks that run on the spans.
import { buildTree, cleanSpans, flatten, type Span } from './trace.js'

export type HealthCheck =
  | 'loop-wrapped'
  | 'tool-at-root'
  | 'orphan'
  | 'no-usage'
  | 'no-thinking'
  | 'generic-name'
  | 'noise'
  | 'error-silent'
  | 'outlives-parent'
export type HealthFinding = {
  check: HealthCheck
  /** `fix` makes the trace harder to debug. `note` is worth knowing. */
  severity: 'fix' | 'note'
  /** The spans it is about. */
  spans: string[]
  text: string
}
export type HealthOptions = {
  /** Look for reasoning on each model call, kept in `attrs.thinking` or `attrs.reasoning`. Off unless you record it. */
  expectThinking?: boolean
  /** Spans shorter than this, sharing a name, count as noise once there are `noiseCount` of them. */
  noiseMs?: number
  noiseCount?: number
}
export type TraceHealth = { findings: HealthFinding[]; fix: number; note: number; text: string }

const GENERIC = /^(span|trace|run|step|llm|tool|agent|call|function|unknown|untitled|\d+)$/i
const hasThinking = (s: Span) => ['thinking', 'reasoning'].some((k) => s.attrs && String(s.attrs[k] ?? '').length > 0)

export function traceHealth(input: Span[], options: HealthOptions = {}): TraceHealth {
  const spans = cleanSpans(input)
  const findings: HealthFinding[] = []
  const add = (f: HealthFinding) => findings.push(f)
  if (spans.length === 0) return { findings, fix: 0, note: 0, text: 'No spans to check.' }
  const byId = new Map(spans.map((s) => [s.id, s]))
  const nodes = flatten(buildTree(spans))
  const roots = nodes.filter((n) => n.depth === 0)

  // One model call wrapping the loop: it has model or tool calls inside it, so tokens and cost cannot be told apart per step.
  for (const n of nodes) {
    if (n.span.kind !== 'llm') continue
    const inner = flatten(n.children).filter((c) => c.span.kind === 'tool' || c.span.kind === 'llm')
    if (inner.length >= 2) {
      add({ check: 'loop-wrapped', severity: 'fix', spans: [n.span.id], text: `"${n.span.name}" is one model call with ${inner.length} calls inside it. Give each model call its own step, so you can see what the agent decided after each result and which call blew up the context.` })
    }
  }

  // A tool call hanging off the very top while other steps exist: it is not shown under the step that asked for it.
  const topSpans = roots.map((r) => r.span)
  if (topSpans.length > 1 || roots.some((r) => r.children.length > 0)) {
    const dangling = roots.filter((r) => r.span.kind === 'tool' && roots.length > 1).map((r) => r.span.id)
    if (dangling.length) add({ check: 'tool-at-root', severity: 'fix', spans: dangling, text: `${dangling.length === 1 ? 'A tool call sits' : `${dangling.length} tool calls sit`} at the top, not under the step that asked for ${dangling.length === 1 ? 'it' : 'them'}.` })
  }

  const orphans = input.filter((s) => s.parentId && s.parentId !== s.id && !byId.has(s.parentId)).map((s) => s.id)
  if (orphans.length) add({ check: 'orphan', severity: 'fix', spans: orphans, text: `${orphans.length} ${orphans.length === 1 ? 'span points' : 'spans point'} at a parent that is not in the trace, so ${orphans.length === 1 ? 'it is' : 'they are'} shown at the top.` })

  const llm = spans.filter((s) => s.kind === 'llm')
  const noUsage = llm.filter((s) => !s.tokens)
  if (noUsage.length) add({ check: 'no-usage', severity: 'note', spans: noUsage.map((s) => s.id), text: `${noUsage.length} of ${llm.length} model calls have no token counts, so cost cannot be worked out for them.` })
  if (options.expectThinking) {
    const bare = llm.filter((s) => !hasThinking(s))
    if (bare.length) add({ check: 'no-thinking', severity: 'note', spans: bare.map((s) => s.id), text: `${bare.length} of ${llm.length} model calls have no recorded reasoning, which is what explains why the agent chose a tool.` })
  }

  const generic = spans.filter((s) => !s.name.trim() || GENERIC.test(s.name.trim()))
  if (generic.length) add({ check: 'generic-name', severity: 'note', spans: generic.map((s) => s.id), text: `${generic.length} ${generic.length === 1 ? 'span has' : 'spans have'} a name that says nothing (${[...new Set(generic.map((s) => `"${s.name || '(empty)'}"`))].slice(0, 3).join(', ')}). Evaluations and dashboards find steps by name, so use stable ones.` })

  const noiseMs = options.noiseMs ?? 1
  const noiseCount = options.noiseCount ?? 20
  const tiny = new Map<string, string[]>()
  for (const s of spans) if (s.durationMs < noiseMs && s.kind !== 'llm' && s.kind !== 'tool') tiny.set(s.name, [...(tiny.get(s.name) ?? []), s.id])
  for (const [name, ids] of tiny) if (ids.length >= noiseCount) add({ check: 'noise', severity: 'note', spans: ids, text: `"${name}" appears ${ids.length} times and each lasts under ${noiseMs} ms. That is noise around the steps that matter.` })

  const silent = spans.filter((s) => s.status === 'error' && (s.output === undefined || s.output === null || s.output === ''))
  if (silent.length) add({ check: 'error-silent', severity: 'fix', spans: silent.map((s) => s.id), text: `${silent.length} failed ${silent.length === 1 ? 'span has' : 'spans have'} no output, so there is nothing to say why ${silent.length === 1 ? 'it' : 'they'} failed.` })

  const late = nodes.filter((n) => n.parent && n.span.startMs + n.span.durationMs > n.parent.span.startMs + n.parent.span.durationMs + 1).map((n) => n.span.id)
  if (late.length) add({ check: 'outlives-parent', severity: 'note', spans: late, text: `${late.length} ${late.length === 1 ? 'span ends' : 'spans end'} after ${late.length === 1 ? 'its' : 'their'} parent, which usually means a missing end time or work that was not awaited.` })

  const fix = findings.filter((f) => f.severity === 'fix').length
  const note = findings.length - fix
  const text = findings.length === 0 ? 'Nothing to fix. Each step is its own span, nested under the step that asked for it.' : `${fix} to fix, ${note} to note.`
  findings.sort((a, b) => Number(b.severity === 'fix') - Number(a.severity === 'fix'))
  return { findings, fix, note, text }
}
