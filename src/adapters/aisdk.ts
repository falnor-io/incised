// Reads AI SDK message parts into the steps PlanVsActual compares. The point: a tool call is "ok" only when the
// message says it produced an output, and a call still waiting or never answered is not counted as having run.
import type { ActualStep } from '../components/planactual.js'

/** The parts of an AI SDK UI message that matter here. Other parts (text, reasoning, files) are ignored. */
export type AiSdkPart = {
  type: string
  toolCallId?: string
  toolName?: string
  state?: string
  input?: unknown
  output?: unknown
  errorText?: string
  approval?: { approved?: boolean }
}
export type AiSdkMessage = { id?: string; role?: string; parts?: AiSdkPart[] }

export type FromAiSdkOptions = {
  /** Turn a tool name into the words shown on the page. Defaults to the name with dashes and underscores as spaces. */
  label?: (toolName: string) => string
  /** Tool name to the plan step it was meant to carry out. */
  planIds?: Record<string, string>
}

const PREFIX = 'tool-'
const words = (n: string) => n.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase()

/** The tool name of a part, or undefined when the part is not a tool call. */
export function toolNameOf(p: AiSdkPart): string | undefined {
  if (p.type === 'dynamic-tool') return p.toolName
  return p.type.startsWith(PREFIX) ? p.type.slice(PREFIX.length) : undefined
}

/**
 * One step per tool call, in message order. `output-available` is ok, `output-error` is error and a call the person
 * denied is blocked. A call still streaming or waiting for an approval or an output is left out, because it has not
 * run yet and counting it would hide a step that never happened.
 */
export function stepsFromAiSdk(messages: AiSdkMessage[], options: FromAiSdkOptions = {}): ActualStep[] {
  const steps: ActualStep[] = []
  messages.forEach((m, mi) => {
    ;(m.parts ?? []).forEach((p, pi) => {
      const name = toolNameOf(p)
      if (!name) return
      let status: ActualStep['status'] | undefined
      if (p.state === 'output-available') status = 'ok'
      else if (p.state === 'output-error') status = 'error'
      else if (p.state === 'output-denied' || p.approval?.approved === false) status = 'blocked'
      if (!status) return
      steps.push({
        id: p.toolCallId ?? `${m.id ?? mi}:${pi}`,
        action: options.label ? options.label(name) : words(name),
        status,
        ...(options.planIds?.[name] ? { planId: options.planIds[name] } : {}),
      })
    })
  })
  return steps
}
