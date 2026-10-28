/**
 * What a person did in a component, in one shape whatever the host. A model hears about it through one of the adapters:
 * as a tool result in the AI SDK, or as context in an MCP App. The decision itself is already bound to the plan hash.
 */
export type OrluneAction = { name: string; context: Record<string, unknown> }

export const decisionAction = (id: string, decision: string, planHash: string, message?: string): OrluneAction => ({
  name: 'decision',
  context: { id, decision, planHash, ...(message ? { message } : {}) },
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
