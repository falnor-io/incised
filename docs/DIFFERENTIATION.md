# Where Orlune is different

The generative-UI libraries answer one question well: how does a model's output become an interface. Orlune starts one
step later, with the question a risk or finance team asks afterwards: **what did the person see when they decided, and can
we prove it?**

## The claim

> Every other library helps a model show something. Orlune lets you prove, later and offline, what was shown, who decided
> on it, and that nothing was changed since.

Three things back it, and each is in the code today:

1. **The model never writes a verdict.** Derived figures (share kept, total wait, confidence intervals, whether an agent
   has earned more autonomy) are in no schema. Verification state comes only from `verifyRecord`.
2. **Decisions are bound to the thing decided.** An approval carries the hash of the plan, so editing the plan makes
   earlier approvals stale. It also carries a `viewHash`: the hash of the evidence, risk and reversibility the reviewer
   saw beside the plan.
3. **What was shown can be signed.** A view receipt (`orlune/verify`: `createViewReceipt`, `signViewReceipt`,
   `verifyViewReceipt`) records the component, the record id and the hash of the exact data drawn. Put it in the ledger
   as a `view` event and the record shows "Shown to reviewer". Check it later against the data you hold now: if one value
   changed, `dataMatches` is false.

## How the others compare

What each project says about itself in the pages I read (listed below). A blank means I found nothing, not that it is
absent from the product.

| | Model output becomes UI | Guardrails on what a model can place | Streaming | Signed, offline-verifiable record | Records what the reviewer was shown |
|---|---|---|---|---|---|
| **AI SDK tool parts** | Tool call to your component, per `part.state` | Zod `inputSchema` per tool | Yes (`input-streaming`) | Approval secret so a client cannot forge an approval | |
| **A2UI** (Google) | Declarative JSON from a catalog | Client-approved catalog | Yes | | |
| **json-render** (Vercel) | JSON spec against a Zod catalog | Catalog and actions | Yes (SpecStream) | | |
| **OpenUI** (Thesys) | Compact streaming language | Your component library | Yes | | |
| **MCP Apps** | Tool returns a `ui://` page in a sandboxed iframe | Iframe sandbox, host review | Host-dependent | | |
| **Tambo** | Zod-registered components the agent picks and streams props into; "interactable" components the agent edits in place | Zod schema per component | Yes | | |
| **Hashbrown** | Exposed components with Skillet schemas; UI Kits; streaming JSON parser with node state | Components you register | Yes | | |
| **assistant-ui** | Tool UI per tool call; data-part UI pushed by the backend; `propStatus` per field | Per-tool renderer | Yes | | Recommends rendering a receipt once a decision is made |
| **Orlune** | Model picks a component and a source id from your data | Zod guards, source ids, no model access to decisions | Yes (`status`, source store) | Yes (hash-chained, Ed25519, offline) | Yes (view receipts, `viewHash`) |

Sources read: [Tambo](https://github.com/tambo-ai/tambo) and its [interactables guide](https://docs.tambo.co/guides/enable-generative-ui/register-interactables), [Hashbrown v0.5](https://hashbrown.dev/blog/2026-07-09-hashbrown-v-0-5-0), [assistant-ui tool UI](https://www.assistant-ui.com/docs/tools/tool-ui), [AI SDK tool usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage), [A2UI](https://a2ui.org/introduction/what-is-a2ui/),
[json-render](https://github.com/vercel-labs/json-render), [OpenUI](https://github.com/thesysdev/openui),
[MCP Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/).

## What this is not

- Not a chat kit, a design system or a protocol. It sits on top of AI SDK, A2UI, json-render or MCP Apps and does not
  replace them. `orluneCatalog` and `mcpAppTool` exist so it can be placed through them.
- Not a way to make a model trustworthy. It makes the human step provable.
- A receipt proves what your server drew and signed. It does not prove what a screen rendered to the eye.

## How to use it

```ts
import { Drawing, SourcesProvider } from 'orlune'
import { signViewReceipt, importPrivateKey } from 'orlune/verify'

<SourcesProvider store={store}>
  <Drawing kind="chains" source="payment" title="Approval" viewer="raj"
    onShown={(receipt) => fetch('/api/receipts', { method: 'POST', body: JSON.stringify(receipt) })} />
</SourcesProvider>

// On your server: sign it and append it to the ledger as a `view` event.
const signed = await signViewReceipt(receipt, await importPrivateKey(process.env.SIGNING_KEY!))
```

The page only creates the unsigned receipt. Signing stays on your server, because a signing key in the browser proves
nothing.

## Wiring it to the protocols

- **A2UI v0.9:** `toA2uiAction(action, { surfaceId, sourceComponentId })` writes the client-to-server `action` message in the
  shape A2UI's actions guide documents. `toA2uiError(invalid, { surfaceId })` writes a `VALIDATION_FAILED` error.
- **Telling the model what did not fit:** `buildOrluneLibrary({ onInvalid })` reports a component whose data failed its schema,
  once per distinct problem and after the render. Send it back with `toA2uiError` so the model can correct itself. While a
  reply streams, props are incomplete and will fail, so act on it only once the stream has finished.
- **AI SDK:** `statusOfToolPart(part.state)` turns a tool part's state into the `status` a component takes, and
  `toToolOutput(action)` is the `output` for `addToolOutput`.
- **MCP Apps:** `toModelContext(action)` for `updateModelContext`, `mcpAppTool(...)` for a tool that points at a `ui://` page.

The A2UI shapes come from A2UI's own documentation for v0.9; I have not run them against an A2UI agent.

## What we took from the others

| Idea | From | In Orlune |
|---|---|---|
| Edit a component already on screen, in place | Tambo's interactable components | `store.patch(kind, id, changes, { allow, check })`: a model may change only the fields you list, a bad change is refused with a reason, and a success returns an action to log. Verdicts and decisions are not on the list. |
| Which fields are still arriving | assistant-ui `propStatus`, Hashbrown parser nodes | `propStatus(args, argsComplete)`. Without a parser it is an approximation: the last key of an open object is the one still being written. |
| Packaged sets of components | Hashbrown UI Kits | `buildOrluneLibrary({ kit: 'workflow' })`, with kits `workflow`, `record`, `review` and `inspect`, or your own list of names. A smaller set is a shorter prompt. |
| A receipt once a decision is made | assistant-ui's "Leave a Receipt" | Decisions already lock the control; view receipts add the record of what was shown. |
| Touch targets | assistant-ui's 44px guidance | Buttons, tabs, inputs and scrubbers grow to 44px on coarse pointers. |

Tambo's README says Tambo Cloud shuts down on 31 October 2026 and the team is moving on to another product. It stays open
source and self-hostable, but the hosted backend is going, a reminder that a design that depends on a hosted service carries
that risk. Orlune holds your data and your keys in your own code.

## Built so far

Receipts show in `RecordViewer` (Views tab) and in `ViewReceiptCard`. `ApprovalQueue` takes `requireView` and `receipts`, so
nothing can be decided until what the reviewer saw has been recorded, and the decision carries `viewHash` and `viewReceipt`.

## What to build next

- A server helper that signs receipts and appends them to the ledger as `view` events.
- Show `viewHash` and the receipt beside each decision in `ApprovalWorkspace`.
- Run the A2UI messages against a real A2UI agent and an MCP Apps host.
