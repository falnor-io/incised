// Rules for summarising one agent run. The point of each: the answers to "did it finish, what did it cost" come from
// the spans, not from anything the agent wrote about itself.
import { buildTree, cleanSpans, kindShares, type KindShare, type Span, type SpanKind } from './trace.js'

export type RunOutcome = 'finished' | 'finished-with-errors' | 'stopped' | 'failed' | 'empty'
export type KindCost = KindShare & { tokensIn: number; tokensOut: number; costUsd: number }
export type RunSummary = {
  outcome: RunOutcome
  /** One plain sentence for the outcome. */
  outcomeText: string
  spans: number
  durationMs: number
  failed: number
  blocked: number
  toolCalls: number
  toolFailures: number
  humanMs: number
  tokensIn: number
  tokensOut: number
  costUsd: number
  byKind: KindCost[]
  costliest: Span[]
}

/** A run is only "finished" when the top span is ok and nothing failed or was blocked inside it. */
export function summarizeRun(input: Span[]): RunSummary {
  const spans = cleanSpans(input)
  if (spans.length === 0) {
    return { outcome: 'empty', outcomeText: 'No spans were recorded.', spans: 0, durationMs: 0, failed: 0, blocked: 0, toolCalls: 0, toolFailures: 0, humanMs: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, byKind: [], costliest: [] }
  }
  const roots = buildTree(spans)
  const root = roots[0]?.span
  const failed = spans.filter((s) => s.status === 'error').length
  const blocked = spans.filter((s) => s.status === 'blocked').length
  const start = Math.min(...spans.map((s) => s.startMs))
  const end = Math.max(...spans.map((s) => s.startMs + s.durationMs))
  const tools = spans.filter((s) => s.kind === 'tool')
  const cost = (k: SpanKind) => spans.filter((s) => s.kind === k)
  const byKind: KindCost[] = kindShares(roots).map((k) => ({
    ...k,
    tokensIn: cost(k.kind).reduce((n, s) => n + (s.tokens?.in ?? 0), 0),
    tokensOut: cost(k.kind).reduce((n, s) => n + (s.tokens?.out ?? 0), 0),
    costUsd: cost(k.kind).reduce((n, s) => n + (s.costUsd ?? 0), 0),
  }))
  let outcome: RunOutcome
  let outcomeText: string
  if (root?.status === 'error') {
    outcome = 'failed'
    outcomeText = 'The run failed.'
  } else if (blocked > 0) {
    outcome = 'stopped'
    outcomeText = `The run stopped at ${blocked === 1 ? 'a gate' : `${blocked} gates`}.`
  } else if (failed > 0) {
    outcome = 'finished-with-errors'
    outcomeText = `The run finished, with ${failed} failed ${failed === 1 ? 'span' : 'spans'}.`
  } else {
    outcome = 'finished'
    outcomeText = 'The run finished with no failures.'
  }
  return {
    outcome, outcomeText, spans: spans.length, durationMs: end - start, failed, blocked,
    toolCalls: tools.length, toolFailures: tools.filter((s) => s.status === 'error').length,
    humanMs: spans.filter((s) => s.kind === 'human').reduce((n, s) => n + s.durationMs, 0),
    tokensIn: spans.reduce((n, s) => n + (s.tokens?.in ?? 0), 0),
    tokensOut: spans.reduce((n, s) => n + (s.tokens?.out ?? 0), 0),
    costUsd: spans.reduce((n, s) => n + (s.costUsd ?? 0), 0),
    byKind,
    costliest: spans.filter((s) => (s.costUsd ?? 0) > 0).sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0)).slice(0, 3),
  }
}
