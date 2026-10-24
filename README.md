# incised

Components for agents that put it in writing.

React components that show what an AI agent did, who signed off, and whether the record has been tampered
with. Two sets:

- **Workflow**: `Swimlane`, `Trail`, `Bottlenecks`, `Priority`, `Funnel`, `Compare`.
- **Record**: `VerifyStatus`, `LedgerTimeline`, `GuaranteeCard`, `RetestClock`, `ConfidenceBar`, `ApprovalGate`.

Plus a small offline verifier (`incised/verify`) and an optional [OpenUI](https://github.com/thesysdev/openui)
binding (`incised/openui`).

> Status: v0. Not published to npm yet. APIs may change.

## Why

Most generative UI libraries give a model a box of charts and let it say anything. Incised is built around
one rule: **the model fills in data, the interface computes everything derived, and verification state never
comes from a model.**

- `Funnel` works out the share kept at each step. `Trail` adds up the waits. `ConfidenceBar` computes an
  exact interval from `passes` and `n`. None of these figures are in any schema, so a model cannot make one up.
- `VerifyStatus` renders only a result from `verifyRecord`. With no result it says "Not verified", never a pass.
- In the OpenUI binding, `VerifyStatus`, `LedgerTimeline` and `GuaranteeCard` take no verification data from the
  model: they read the verifier's result from `RecordProvider`.
- `RetestClock` and `ApprovalGate` are not exposed to models at all. Their state is a fact about the world, so
  your code passes it in.
- Anything that fails its schema renders nothing.

## Use

```bash
npm install incised zod react
```

```tsx
import 'incised/styles.css'
import { Funnel, VerifyStatus, LedgerTimeline, RecordProvider } from 'incised'
import { verifyRecord } from 'incised/verify'

const result = await verifyRecord(record) // record = manifest + signatures + ledger + public keys

<RecordProvider result={result} manifest={record.manifest}>
  <VerifyStatus />
  <LedgerTimeline />
</RecordProvider>

<Funnel title="How many make it through" unit="deals" steps={[
  { label: 'Signed', value: 40 },
  { label: 'Set up', value: 31 },
]} />
```

### Theming

Plain CSS, no Tailwind. Components read `--background`, `--foreground`, `--muted-foreground`, `--border` and
`--primary` when present, so a shadcn theme applies as is. Override any `--ic-*` variable to change it.

### With OpenUI

```ts
import { buildIncisedLibrary } from 'incised/openui'
const library = buildIncisedLibrary() // pass to <Renderer library={library} />
// or merge with your own: createLibrary({ root, components: [...mine, ...incisedComponents()] })
```

`@openuidev/react-lang` is an optional peer dependency, needed only for this entry point.

## The record format

The verifier reads a bundle of four parts, all plain JSON:

| Part | What it proves |
| --- | --- |
| `manifest` | The guarantees as data: statement, check, deadline, remedy. Hashed with canonical JSON (sorted keys). |
| `signatures` | Each party's Ed25519 signature over the manifest hash. Both must sign. |
| `ledger` | Append-only events. Each carries the hash of the one before it and its own signature. |
| `publicKeys` | One PEM (SPKI) per party. |

`verifyRecord` checks the manifest hash, every signature, the hash chain, and the deadline rules, using Web
Crypto only. No network. A breach counts as honored only when a matching `remedy` event exists. Pass
`{ now }` to judge open deadlines at a fixed time.

Built-in guarantee rules are keyed by id: `G1-CRITERIA`, `G2-RETEST-48H`, `G3-ROOTCAUSE-24H`,
`G4-RECORD-OWNED`. Other ids are listed in the manifest but not judged yet.

## Try it

```bash
npm install
npm run sample      # writes a signed sample record
npm test
npm run demo        # opens the demo, with a button that edits one ledger event
```

## What it does not claim

- Passing verification shows the record is intact and the deadlines in it were met. It does not show the
  agent is correct. `ConfidenceBar` exists to keep that distinction visible: 50 cases never prove 90%.
- A zero-failure count is a bound, not a guarantee, and the component says so.

## License

MIT. Built by [Falnor](https://falnor.io).
