/**
 * What a person did in a component, in one shape whatever the host. A model hears about it through one of the adapters:
 * as a tool result in the AI SDK, or as context in an MCP App. The decision itself is already bound to the plan hash.
 */
export type OrluneAction = { name: string; context: Record<string, unknown> }

/** `viewHash` is the hash of what the reviewer was shown when they decided, from `viewDigest`. */
export const decisionAction = (id: string, decision: string, planHash: string, message?: string, viewHash?: string, viewReceipt?: string): OrluneAction => ({
  name: 'decision',
  context: { id, decision, planHash, ...(message ? { message } : {}), ...(viewHash ? { viewHash } : {}), ...(viewReceipt ? { viewReceipt } : {}) },
})

export const inputAction = (result: { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, unknown> }): OrluneAction => ({
  name: 'input',
  context: { action: result.action, ...(result.content ? { content: result.content } : {}) },
})

/** The `output` for the AI SDK's `addToolOutput({ tool, toolCallId, output })`. */
export const toToolOutput = (a: OrluneAction): { action: string } & Record<string, unknown> => ({ action: a.name, ...a.context })

/** The argument for an MCP App's `app.updateModelContext(...)`: a text block the model reads on its next turn. */
export const toModelContext = (a: OrluneAction): { content: { type: 'text'; text: string }[] } => ({
  content: [{ type: 'text', text: `The person did "${a.name}": ${JSON.stringify(a.context)}` }],
})

/**
 * The action as an A2UI v0.9 client-to-server message, in the shape A2UI's actions guide documents: `version` and an
 * `action` with `name`, `surfaceId`, `sourceComponentId`, `timestamp` and `context`. Send it over whatever transport your
 * A2UI agent uses.
 */
export const toA2uiAction = (a: OrluneAction, o: { surfaceId: string; sourceComponentId: string; at?: Date }) => ({
  version: 'v0.9' as const,
  action: { name: a.name, surfaceId: o.surfaceId, sourceComponentId: o.sourceComponentId, timestamp: (o.at ?? new Date()).toISOString(), context: a.context },
})

/**
 * What the model wrote that did not fit, as an A2UI v0.9 `VALIDATION_FAILED` error, which is how A2UI tells an agent to
 * correct its output and send the UI again. Pair it with `onInvalid` from the OpenUI binding.
 */
export const toA2uiError = (invalid: { component: string; issues: { path: string; message: string }[] }, o: { surfaceId: string }) => ({
  version: 'v0.9' as const,
  error: {
    code: 'VALIDATION_FAILED' as const,
    surfaceId: o.surfaceId,
    path: `/${invalid.component}${invalid.issues[0]?.path ? `/${invalid.issues[0].path}` : ''}`,
    message: invalid.issues.map((i) => `${i.path || 'value'}: ${i.message}`).join('; ') || `${invalid.component} did not fit its schema.`,
  },
})

/** The AI SDK tool-part states, as the `status` a component takes. A request for approval is `awaiting`: everything is shown and a person has to act. */
export type ToolPartState = 'input-streaming' | 'input-available' | 'approval-requested' | 'approval-responded' | 'output-available' | 'output-error' | 'output-denied'

export const statusOfToolPart = (state: ToolPartState): 'loading' | 'partial' | 'awaiting' | 'ready' | 'error' => {
  switch (state) {
    case 'input-streaming': return 'partial'
    case 'approval-requested': return 'awaiting'
    case 'input-available': return 'loading'
    case 'output-error':
    case 'output-denied': return 'error'
    default: return 'ready'
  }
}
