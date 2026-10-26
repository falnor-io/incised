// Reads OpenTelemetry spans (the OTLP JSON shape) into Orlune spans. The point: you can feed a trace you already
// collect to TraceExplorer and RunInspector without mapping it by hand, and nothing is invented on the way. A span
// with no cost attribute has no cost, and a status OpenTelemetry does not have is never filled in.
import type { Span, SpanKind, SpanStatus } from '../components/trace.js'

type AnyValue = { stringValue?: string; intValue?: string | number; doubleValue?: number; boolValue?: boolean }
type KeyValue = { key: string; value?: AnyValue }
export type OtlpSpan = {
  traceId?: string
  spanId: string
  parentSpanId?: string
  name: string
  startTimeUnixNano: string | number
  endTimeUnixNano: string | number
  attributes?: KeyValue[]
  /** 0 unset, 1 ok, 2 error. */
  status?: { code?: number | string; message?: string }
}
export type OtlpExport = { resourceSpans?: { scopeSpans?: { spans?: OtlpSpan[] }[] }[] }

export type FromOtlpOptions = {
  /** Only this trace. Without it, every trace in the export is returned and ids are made unique per trace. */
  traceId?: string
  /** Where a cost is kept, if you record one. OpenTelemetry has no standard attribute for it. */
  costAttribute?: string
  /** Decide the kind yourself. Return undefined to use the built-in reading. */
  kindOf?: (span: OtlpSpan, attrs: Record<string, string | number | boolean>) => SpanKind | undefined
}

function scalar(v?: AnyValue): string | number | boolean | undefined {
  if (!v) return undefined
  if (v.stringValue !== undefined) return v.stringValue
  if (v.intValue !== undefined) return Number(v.intValue)
  if (v.doubleValue !== undefined) return v.doubleValue
  if (v.boolValue !== undefined) return v.boolValue
  return undefined
}

function attrsOf(list?: KeyValue[]): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const kv of list ?? []) {
    const v = scalar(kv.value)
    if (v !== undefined) out[kv.key] = v
  }
  return out
}

const OPENINFERENCE: Record<string, SpanKind> = { LLM: 'llm', TOOL: 'tool', RETRIEVER: 'retrieval', RERANKER: 'retrieval', EMBEDDING: 'retrieval', AGENT: 'agent', CHAIN: 'agent' }
const GENAI_OPERATION: Record<string, SpanKind> = {
  chat: 'llm', text_completion: 'llm', generate_content: 'llm', execute_tool: 'tool', invoke_agent: 'agent', create_agent: 'agent', embeddings: 'retrieval', retrieval: 'retrieval',
}

/** From the OpenInference span kind, then the GenAI operation name, then the span name. Anything else is "agent". */
export function kindFromAttributes(name: string, attrs: Record<string, string | number | boolean>): SpanKind {
  const oi = attrs['openinference.span.kind']
  if (typeof oi === 'string' && OPENINFERENCE[oi.toUpperCase()]) return OPENINFERENCE[oi.toUpperCase()]!
  const op = attrs['gen_ai.operation.name']
  if (typeof op === 'string' && GENAI_OPERATION[op]) return GENAI_OPERATION[op]!
  if (attrs['gen_ai.tool.name'] !== undefined) return 'tool'
  if (/retriev|vector|embed/i.test(name)) return 'retrieval'
  return 'agent'
}

const nano = (v: string | number) => {
  try { return BigInt(typeof v === 'number' ? Math.round(v) : v) } catch { return 0n }
}

/** One Orlune span per OTLP span. Times are milliseconds from the earliest start, so they are exact to the microsecond. */
export function spansFromOtlp(data: OtlpExport, options: FromOtlpOptions = {}): Span[] {
  const raw: OtlpSpan[] = []
  for (const rs of data.resourceSpans ?? []) for (const ss of rs.scopeSpans ?? []) for (const s of ss.spans ?? []) raw.push(s)
  const picked = options.traceId ? raw.filter((s) => s.traceId === options.traceId) : raw
  if (picked.length === 0) return []
  const traces = new Set(picked.map((s) => s.traceId ?? ''))
  const key = (s: OtlpSpan, id: string) => (traces.size > 1 ? `${s.traceId ?? ''}:${id}` : id)
  const t0 = picked.reduce((m, s) => { const t = nano(s.startTimeUnixNano); return t < m ? t : m }, nano(picked[0]!.startTimeUnixNano))
  return picked.map((s): Span => {
    const attrs = attrsOf(s.attributes)
    const start = nano(s.startTimeUnixNano)
    const end = nano(s.endTimeUnixNano)
    const code = Number(s.status?.code ?? 0)
    const status: SpanStatus = code === 2 || String(s.status?.code).toUpperCase() === 'STATUS_CODE_ERROR' ? 'error' : 'ok'
    const tin = attrs['gen_ai.usage.input_tokens']
    const tout = attrs['gen_ai.usage.output_tokens']
    const cost = options.costAttribute ? attrs[options.costAttribute] : undefined
    const input = attrs['gen_ai.tool.call.arguments'] ?? attrs['input.value'] ?? attrs['gen_ai.input.messages']
    const output = attrs['gen_ai.tool.call.result'] ?? attrs['output.value'] ?? attrs['gen_ai.output.messages']
    return {
      id: key(s, s.spanId),
      parentId: s.parentSpanId ? key(s, s.parentSpanId) : undefined,
      name: s.name,
      kind: options.kindOf?.(s, attrs) ?? kindFromAttributes(s.name, attrs),
      startMs: Number(start - t0) / 1e6,
      durationMs: Math.max(0, Number(end - start) / 1e6),
      status,
      attrs,
      ...(input !== undefined ? { input } : {}),
      ...(output !== undefined ? { output } : s.status?.message ? { output: s.status.message } : {}),
      ...(typeof tin === 'number' || typeof tout === 'number' ? { tokens: { in: typeof tin === 'number' ? tin : 0, out: typeof tout === 'number' ? tout : 0 } } : {}),
      ...(typeof cost === 'number' ? { costUsd: cost } : {}),
    }
  })
}
