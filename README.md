# incised

Components for agents that put it in writing.

Incised is an open-source set of React components for showing what an AI agent did, who signed off,
and whether the record has been tampered with. Each component is a plain React component with a Zod
schema, so it can be used on its own or exposed to a model through a generative UI runtime such as
OpenUI.

> Status: v0, in development. Nothing is published yet.

## Planned components

Workflow: Swimlane, Trail, Bottlenecks, Priority, Funnel, Compare.

Records: GuaranteeCard, VerifyStatus, LedgerTimeline, RetestClock, ConfidenceBar, ApprovalGate.

## Design rules

- The model fills in data. The interface computes anything derived, such as shares and intervals.
- Verification state comes from a verifier, never from model output.
- Unknown components are dropped, not rendered.

## License

MIT. Built by [Falnor](https://falnor.io).
