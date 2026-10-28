# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers shipping agent apps: frontend and AI engineers building products where an agent acts and a person must review, approve or audit what it did. They install components as source through a shadcn registry or as the `orlune` npm package, and wire them to their own traces, ledgers and approval data. The people who finally open the screens are reviewers in risk, finance and operations, and the components are shaped around their questions, but the developer is the customer.

## Product Purpose

React components that show what an AI agent did, who signed off, and whether the record was tampered with. 53 registry items in five sets (workflow, record, complex, judgement, workspace), plus an offline verifier, adapters for OpenTelemetry, AI SDK and LangGraph, and an optional OpenUI binding for generative UI. Success is a team ships an accountable review surface without building the arithmetic, states and keyboard model themselves.

## Positioning

The model fills in data; the interface computes everything derived; verification state never comes from a model. Figures such as share kept, total wait, confidence intervals and verdicts appear in no schema, so a model cannot invent them. `VerifyStatus` says "Not verified" without a verifier result, and decisions and grants are never exposed to models. Other generative-UI libraries give a model a box of charts and let it say anything.

## Operating Context

Review and audit work: approving a payment plan, inspecting an agent run, checking whether an agent has earned more autonomy, verifying a signed hash-chained record. Used inside the host app's own theme (shadcn variables are inherited) in light and dark, in Next.js server components and Cloudflare Workers, and through OpenUI Lang where a model places components by source id.

## Capabilities and Constraints

- Plain CSS with `--ol-*` variables, no Tailwind; themeable by overriding variables or inheriting shadcn tokens.
- Server-render safe: nothing animates on first paint, a figure starts at its value, reduced motion turns every animation off.
- Keyboard and screen-reader support on every component, with text equivalents (for example the table behind a Sankey); axe tests run in CI.
- Logic lives in pure, tested files; views only draw it. Every component ships with its empty, partial and error states.
- Anything that fails its schema renders nothing. Decision-carrying components (`ApprovalGate`, `RetestClock`, `ApprovalQueue`, `InputRequest`, `ReceiptCard`) stay out of the model's reach.
- Status: v0, APIs may change before 1.0. MIT licensed. Terminology: "judgement" is a component that takes raw cases and a rule and says what follows; "workspace" is a composed screen.
- Undecided: npm release date; whether playback and Ask become part of the OpenUI surface.

## Brand Commitments

Name Orlune, published by Falnor. Voice: plain, literal, no hype; says what a component computes and why a model cannot write the answer. Tagline: "Components for agents that put it in writing."

## Evidence on Hand

Real specimens and light and dark screenshots for every component in `docs/` and `demo/`, a docs site with a playground in `site/`, 442 passing tests, and sample signed records from `npm run sample`. There are no customers, testimonials, benchmarks or usage numbers; future work must not invent any.

## Product Principles

1. The model supplies facts or chooses which fact to show; the interface does the arithmetic and owns every verdict.
2. Say why: every verdict carries the number and the rule behind it, in words.
3. Design every state, not just the happy one: empty, loading, error, partial and not-enough-data.
4. Motion explains and never decorates: it replays or reveals real steps, starts only when asked, and yields to reduced motion.
5. Honest by default: no fabricated claims in components, demos or docs; absent data reads as absent, never as zero or a pass.

## Accessibility & Inclusion

Keyboard operable, readable by screen reader with a text equivalent for every drawing, respects `prefers-reduced-motion`, and works in light and dark.
