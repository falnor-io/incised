import type { ComponentType } from 'react';
import {
  ActivityHeatmap,
  ApprovalChain,
  ApprovalGate,
  ApprovalQueue,
  ApprovalWorkspace,
  AutonomyBoard,
  AutonomyGate,
  Bottlenecks,
  BudgetMeter,
  ChainGraph,
  Compare,
  ConfidenceBar,
  ControlChart,
  DataGrid,
  DeadlineGantt,
  DiffViewer,
  EvalMatrix,
  EvidenceTable,
  FleetBoard,
  FlowCanvas,
  Funnel,
  GuaranteeCard,
  HandoffPacket,
  InputRequest,
  JsonTree,
  LedgerTimeline,
  PermissionGrant,
  PlanVsActual,
  Priority,
  ReceiptCard,
  RecordViewer,
  RetestClock,
  RunBranches,
  RunInspector,
  RunTheatre,
  RunVariants,
  Sankey,
  SealedRecord,
  Swimlane,
  TraceExplorer,
  Trail,
  VerifyBadge,
  VerifyStatus,
  planDigest,
} from 'orlune';
import { verifyRecord, type RecordBundle } from 'orlune/verify';
import sample from '@demo/sample-record.json';
import {
  NOW_ISO,
  actualSteps,
  budgetSamples,
  buildQueue,
  chainDecisions,
  chainSteps,
  checkpointHistory,
  diffComments,
  diffFiles,
  diffFilesMoved,
  evidenceAvailable,
  evidenceDocs,
  evidenceRows,
  evidenceRowsChecked,
  flowEdges,
  flowNodes,
  fleetAgents,
  gateCases,
  gateCasesBlocked,
  gateCasesReady,
  ganttRows,
  grantRows,
  handoffFull,
  handoffThin,
  heatDays,
  lateChainDecisions,
  planSteps,
  runRows,
  sankeyLinks,
  sankeyNodes,
  spcData,
  theatreStages,
  theatreTotals,
  traceSpans,
  userScopes,
  variantPlan,
  variantRuns,
  workspaceExtras,
} from '@demo/data';

export type Group = 'Workflow' | 'Record' | 'Complex' | 'Judgement' | 'Workspace';

export type PlaygroundEntry = {
  name: string;
  group: Group;
  summary: string;
  // The playground renders any component from the package, so the prop types differ per entry.
  // biome-ignore lint/suspicious/noExplicitAny: each entry pairs a component with its own sample props.
  component: ComponentType<any>;
  /** The starting props. Plain JSON, so each one can be edited as text and shared in a link. */
  props: Record<string, unknown>;
  /** Callback props. The playground passes a logger for each and shows every call. */
  events?: string[];
  /** Props that need an async step, such as the verifier. Merged over `props` when the entry opens. */
  load?: () => Promise<Record<string, unknown>>;
  /** Turns the editable JSON into real props, for a component that takes functions. */
  adapt?: (props: Record<string, unknown>) => Record<string, unknown>;
  /** Named variants. Each one replaces the props, so a person can jump to a state worth seeing. */
  presets?: { label: string; props: Record<string, unknown> }[];
};

const record = sample as unknown as RecordBundle;
const NOW = new Date('2026-06-10T00:00:00Z');
const verified = () => verifyRecord(record, { now: NOW });
const tampered = () => {
  const edited = structuredClone(record);
  edited.ledger[3]!.result = 'fail';
  return verifyRecord(edited, { now: NOW });
};

const cases = [
  'Duplicate invoice',
  'Missing PO number',
  'Vendor name mismatch',
  'Over approval limit',
  'Currency conversion',
  'Late-fee dispute',
  'Split shipment',
  'Tax ID missing',
  'Credit note',
  'Rush payment',
].map((label, i) => ({ id: `c${i}`, label }));
const allPass = Object.fromEntries(cases.map((c) => [c.id, true]));

type Col = { id: string; header: string; key: string; type?: string; width?: number; pin?: boolean; aggregate?: string; sortable?: boolean };

export const entries: PlaygroundEntry[] = [
  // Workflow
  {
    name: 'Swimlane',
    group: 'Workflow',
    summary: 'Who does what, and where it waits.',
    component: Swimlane,
    props: {
      title: 'Client onboarding: who does what',
      lanes: [
        { owner: 'Sales', steps: [{ name: 'Proposal signed' }, { name: 'Handoff email', waiting: true }] },
        { owner: 'Operations', steps: [{ name: 'Project set up', waiting: true }, { name: 'Kickoff booked' }] },
      ],
    },
  },
  {
    name: 'Trail',
    group: 'Workflow',
    summary: 'One request, stop by stop. Total wait is computed.',
    component: Trail,
    props: {
      title: 'Where one request waits',
      request: 'Referral 1042',
      stops: [
        { owner: 'Front desk', name: 'Referral received', note: 'Logged in the inbox', waitDays: 0 },
        { owner: 'Doctor', name: 'Sign-off', note: 'Waits for the next clinic day', waitDays: 3 },
        { owner: 'Admin', name: 'Letter sent', note: 'Printed and posted', waitDays: 1 },
        { owner: 'Patient', name: 'Appointment booked', note: 'Phone tag', waitDays: 2 },
      ],
    },
  },
  {
    name: 'Bottlenecks',
    group: 'Workflow',
    summary: 'Where work waits most.',
    component: Bottlenecks,
    props: { title: 'Where work waits most', unit: 'days', items: [{ stage: 'Handoff', amount: 2 }, { stage: 'Set up', amount: 3 }, { stage: 'Kickoff', amount: 2 }] },
  },
  {
    name: 'Funnel',
    group: 'Workflow',
    summary: 'How many make it through each step. The share kept is computed.',
    component: Funnel,
    props: { title: 'How many make it through', unit: 'deals', steps: [{ label: 'Signed', value: 40 }, { label: 'Set up', value: 31 }, { label: 'Kickoff held', value: 22 }] },
  },
  {
    name: 'Priority',
    group: 'Workflow',
    summary: 'Impact against effort, labelled as a judgement.',
    component: Priority,
    props: {
      title: 'Where to start',
      items: [
        { label: 'Handoff to operations', impact: 'high', effort: 'low' },
        { label: 'Project set up', impact: 'high', effort: 'high' },
        { label: 'Kickoff booked', impact: 'low', effort: 'low' },
      ],
    },
  },
  {
    name: 'Compare',
    group: 'Workflow',
    summary: 'Today against a mapped version.',
    component: Compare,
    props: {
      title: 'Who holds the handoff',
      leftLabel: 'Today',
      rightLabel: 'Mapped',
      rows: [
        { label: 'Owner', left: 'Whoever sees the email', right: 'One named person' },
        { label: 'Written down', left: "In people's heads", right: 'In the workflow' },
        { label: 'Checked', left: 'When someone remembers', right: 'At every signed deal' },
      ],
    },
  },

  // Record
  {
    name: 'VerifyStatus',
    group: 'Record',
    summary: 'The verdict from the verifier. Edit the record in the sample and see it change.',
    component: VerifyStatus,
    props: { result: null },
    load: async () => ({ result: await verified() }),
  },
  {
    name: 'VerifyBadge',
    group: 'Record',
    summary: 'A small mark that opens to the full result.',
    component: VerifyBadge,
    props: { result: null },
    load: async () => ({ result: await verified() }),
  },
  {
    name: 'LedgerTimeline',
    group: 'Record',
    summary: 'The signed events. Incident, re-test and remedy stand out.',
    component: LedgerTimeline,
    props: { events: [] },
    load: async () => ({ events: (await verified()).events }),
  },
  {
    name: 'GuaranteeCard',
    group: 'Record',
    summary: 'One guarantee and its status.',
    component: GuaranteeCard,
    props: { ...record.manifest.guarantees[2]!, status: 'remedied', detail: 'incident #5 root cause in 36.0h' },
  },
  {
    name: 'RetestClock',
    group: 'Record',
    summary: 'Met, missed or time left, from the dates.',
    component: RetestClock,
    props: { label: 'Re-test after model release #3', startedAt: '2026-06-03T00:00:00Z', resolvedAt: '2026-06-04T06:00:00Z', deadlineHours: 48, result: 'pass' },
  },
  {
    name: 'ConfidenceBar',
    group: 'Record',
    summary: 'An exact interval. Try 45 of 50 against a 90% claim.',
    component: ConfidenceBar,
    props: { label: 'Exception routing accuracy', passes: 45, n: 50, threshold: 0.9 },
    presets: [{ label: 'Same rate, a bigger sample', props: { label: 'Same rate, 900 of 1000', passes: 900, n: 1000, threshold: 0.85 } }],
  },
  {
    name: 'ApprovalGate',
    group: 'Record',
    summary: 'Escalation counts as a correct outcome.',
    component: ApprovalGate,
    props: { action: 'Release payment over the approval limit', approver: 'Controller', state: 'escalated', note: 'The agent held the payment and asked a person.' },
  },

  // Complex
  {
    name: 'TraceExplorer',
    group: 'Complex',
    summary: 'Flame graph, waterfall and ranked list over one axis.',
    component: TraceExplorer,
    props: { title: 'Invoice exception run', spans: traceSpans, defaultSelected: 'vendor' },
  },
  {
    name: 'DiffViewer',
    group: 'Complex',
    summary: 'A review-grade diff. Try the moved-code files.',
    component: DiffViewer,
    props: { title: 'Approval policy and prompt, v3 to v4', files: diffFiles, comments: diffComments, order: 'given' },
    events: ['onDecideHunk', 'onView'],
    presets: [{ label: 'Moved code and authorship', props: { title: 'Policy change, moved rules', files: diffFilesMoved, comments: [], order: 'salience' } }],
  },
  {
    name: 'FlowCanvas',
    group: 'Complex',
    summary: 'Pan, zoom, minimap and swimlanes. Arrow keys walk the edges.',
    component: FlowCanvas,
    props: { title: 'Payment approval', nodes: flowNodes, edges: flowEdges, height: 420, defaultSelected: 'limit' },
  },
  {
    name: 'DataGrid',
    group: 'Complex',
    summary: 'Thousands of rows, only the visible ones drawn. Columns are plain JSON here.',
    component: DataGrid,
    props: {
      title: 'Agent runs',
      noun: 'runs',
      height: 400,
      rowCount: 2400,
      columns: [
        { id: 'id', header: 'Run', key: 'id', width: 120, pin: true },
        { id: 'deployment', header: 'Deployment', key: 'deployment', width: 170 },
        { id: 'model', header: 'Model', key: 'model', width: 110 },
        { id: 'status', header: 'Status', key: 'status', type: 'status', width: 110 },
        { id: 'duration', header: 'Duration', key: 'durationMs', type: 'duration', width: 110, aggregate: 'avg' },
        { id: 'cost', header: 'Cost', key: 'costUsd', type: 'usd', width: 100, aggregate: 'sum' },
        { id: 'pass', header: 'Pass rate', key: 'passRate', type: 'percent', width: 150, aggregate: 'avg' },
        { id: 'trend', header: 'Trend', key: 'trend', type: 'spark', width: 110, sortable: false },
        { id: 'steps', header: 'Steps', key: 'steps', type: 'number', width: 80 },
        { id: 'started', header: 'Started (UTC)', key: 'startedAt', type: 'date', width: 140 },
      ],
    },
    adapt: (p) => {
      const { rowCount, columns, ...rest } = p as { rowCount?: number; columns?: Col[] };
      const rows = runRows.slice(0, Math.max(0, Math.min(Number(rowCount) || 0, runRows.length)));
      return {
        ...rest,
        rows,
        rowId: (r: { id: string }) => r.id,
        columns: (columns ?? []).map(({ key, ...c }) => ({ ...c, value: (r: Record<string, unknown>) => r[key] })),
      };
    },
  },
  {
    name: 'ControlChart',
    group: 'Complex',
    summary: 'Failure rate with 3-sigma limits and the run rules. Set rules to [1,2,3,4,5,6,7,8] for Nelson.',
    component: ControlChart,
    props: { title: 'Daily failure rate, invoice exceptions', data: spcData, baseline: 10, markers: [{ at: 11, label: 'Model X.1 released' }] },
    presets: [{ label: 'All eight Nelson rules', props: { title: 'Daily failure rate, all eight Nelson rules', data: spcData, baseline: 10, rules: [1, 2, 3, 4, 5, 6, 7, 8], markers: [{ at: 11, label: 'Model X.1 released' }] } }],
  },
  {
    name: 'Sankey',
    group: 'Complex',
    summary: 'Where cases go, sized by volume.',
    component: Sankey,
    props: { title: 'Where 1,900 invoices went', nodes: sankeyNodes, links: sankeyLinks, unit: 'invoices' },
  },
  {
    name: 'ApprovalQueue',
    group: 'Complex',
    summary: 'Approvals bound to the exact plan by hash. Reject, reply and edit, then watch the events.',
    component: ApprovalQueue,
    props: { title: 'Approvals waiting', items: [], reviewer: 'raj', now: NOW_ISO },
    events: ['onDecide', 'onEdit', 'onSelect'],
    load: async () => ({ items: await buildQueue(planDigest) }),
  },
  {
    name: 'DeadlineGantt',
    group: 'Complex',
    summary: 'Every deadline clock on one axis.',
    component: DeadlineGantt,
    props: { title: 'Deadline clocks', rows: ganttRows, now: NOW_ISO },
  },
  {
    name: 'ActivityHeatmap',
    group: 'Complex',
    summary: 'Six months of activity, breach days in red.',
    component: ActivityHeatmap,
    props: { title: 'Re-tests and incidents', days: heatDays, noun: 'events' },
  },
  {
    name: 'EvalMatrix',
    group: 'Complex',
    summary: 'Pass rates with intervals and an exact paired comparison.',
    component: EvalMatrix,
    props: {
      title: 'Re-test after model release',
      cases,
      runs: [
        { label: 'Model X', results: allPass },
        { label: 'Model X.1', results: { ...allPass, c1: false, c3: false, c5: false, c6: false, c8: false, c9: false } },
        { label: 'Model Y', results: { ...allPass, c4: false } },
      ],
    },
  },
  {
    name: 'FleetBoard',
    group: 'Complex',
    summary: 'Sort, filter, tightest deadline computed.',
    component: FleetBoard,
    props: {
      title: 'Deployments',
      now: '2026-06-10T00:00:00Z',
      rows: [
        { name: 'AP exceptions', model: 'model-x', status: 'ok', clocks: [{ label: 'Re-test after release', startedAt: '2026-06-09T06:00:00Z', deadlineHours: 48 }] },
        { name: 'Claims intake', model: 'model-x', status: 'breached', clocks: [{ label: 'Root cause for incident', startedAt: '2026-06-08T12:00:00Z', deadlineHours: 24 }] },
        { name: 'Referral triage', model: 'model-y', status: 'watch', clocks: [{ label: 'Re-test after release', startedAt: '2026-06-08T20:00:00Z', deadlineHours: 48 }] },
        { name: 'Renewals follow-up', model: 'model-y', status: 'ok', clocks: [] },
      ],
    },
  },
  {
    name: 'ChainGraph',
    group: 'Complex',
    summary: 'The hash chain. This sample has one edited event, so the break shows.',
    component: ChainGraph,
    props: { events: [] },
    load: async () => ({ events: (await tampered()).events }),
  },
  {
    name: 'ReceiptCard',
    group: 'Complex',
    summary: 'A printable signed receipt for one action.',
    component: ReceiptCard,
    props: {
      title: 'Payment held for review',
      issuedAt: '2026-06-05T08:00:00Z',
      hash: '09cfbff6cb9d1e3a7b2c4f80d5a6e1b39c7d02f4a8e5b6c1d3f70a92e4b8c615',
      rows: [
        { label: 'Invoice', value: 'INV-2291, Northwind' },
        { label: 'Amount', value: '$12,400.00' },
        { label: 'Reason', value: 'Over the $5,000 approval limit' },
        { label: 'Decision', value: 'Escalated to the controller' },
      ],
      signers: [{ party: 'meridian-ai', valid: true }, { party: 'northwind', valid: true }],
    },
  },
  {
    name: 'JsonTree',
    group: 'Complex',
    summary: 'A collapsible tree for any JSON value.',
    component: JsonTree,
    props: { label: 'plan', defaultExpandDepth: 2, value: { action: 'release_payment', invoice: 'INV-2291', amount: 12400, to: { vendor: 'Northwind Ltd', account: '••••4821' } } },
  },

  // Judgement
  {
    name: 'AutonomyGate',
    group: 'Judgement',
    summary: 'When an agent has earned more autonomy. Swap the cases for the ready or blocked sets.',
    component: AutonomyGate,
    props: { title: 'Invoice agent, shadow period', tier: 'T2', cases: gateCases, rule: { rate: 0.9, minCases: 30 }, looks: 2 },
    presets: [
      { label: 'Six weeks on', props: { title: 'Invoice agent, six weeks on', tier: 'T2', cases: gateCasesReady, rule: { rate: 0.9, minCases: 30 } } },
      {
        label: 'Held back by a critical task',
        props: {
          title: 'Invoice agent, all tasks',
          tier: 'T2',
          cases: gateCasesBlocked,
          rule: { rate: 0.9, minCases: 30, critical: ['Dispute letters'], reviewFloor: { underMs: 5000, maxShare: 0.5 }, controls: [{ label: 'an incident process', done: false }, { label: 'monitoring', done: true }] },
        },
      },
    ],
  },
  {
    name: 'EvidenceTable',
    group: 'Judgement',
    summary: 'Each value with where it was read from. Add documents to check each quote.',
    component: EvidenceTable,
    props: { title: 'Invoice INV-2291, checked against the documents', rows: evidenceRowsChecked, documents: evidenceDocs, available: evidenceAvailable },
  },
  {
    name: 'PlanVsActual',
    group: 'Judgement',
    summary: 'What the agent planned next to what it did.',
    component: PlanVsActual,
    props: { title: 'Invoice run, plan against actual', plan: planSteps, actual: actualSteps },
  },
  {
    name: 'ApprovalChain',
    group: 'Judgement',
    summary: 'Who has to approve, in order, with a time limit on each step.',
    component: ApprovalChain,
    props: { title: 'Payment of $12,400.00', requester: 'agent', startedAt: '2026-06-10T08:00:00Z', steps: chainSteps, decisions: chainDecisions, now: NOW_ISO },
    presets: [{ label: 'A day later, step late', props: { title: 'Payment of $12,400.00, a day later', requester: 'agent', startedAt: '2026-06-10T08:00:00Z', steps: chainSteps, decisions: lateChainDecisions, now: '2026-06-10T13:00:00Z' } }],
  },
  {
    name: 'HandoffPacket',
    group: 'Judgement',
    summary: 'What an agent hands a person when it stops. Delete a part and see it named.',
    component: HandoffPacket,
    props: { title: 'Invoice INV-2291, handed to a person', handoff: handoffFull, now: NOW_ISO },
    presets: [{ label: 'A thin handoff', props: { title: 'Dispute letter, handed to a person', handoff: handoffThin, now: NOW_ISO } }],
  },
  {
    name: 'PermissionGrant',
    group: 'Judgement',
    summary: 'What the agent may do, how much is left, and when it ends.',
    component: PermissionGrant,
    props: { title: 'Invoice agent, permissions', grants: grantRows, now: NOW_ISO, userScopes },
  },
  {
    name: 'BudgetMeter',
    group: 'Judgement',
    summary: 'Spend against a limit, with the burn rate it implies.',
    component: BudgetMeter,
    props: { title: 'Model and tool spend, June', limit: 1500, used: 860, unit: 'USD', periodStart: '2026-06-01T00:00:00Z', periodEnd: '2026-07-01T00:00:00Z', samples: budgetSamples, now: '2026-06-10T00:00:00Z' },
  },
  {
    name: 'InputRequest',
    group: 'Judgement',
    summary: 'A form an agent hands to a person. Each answer is checked against its field.',
    component: InputRequest,
    props: {
      title: 'Confirm the refund',
      asked: 'The invoice was paid twice, and I cannot tell which payment to reverse.',
      context: [{ label: 'Invoice', value: 'INV-2291' }, { label: 'Paid', value: '$12,400.00 twice' }],
      fields: [
        { name: 'payment', label: 'Payment to reverse', type: 'select', required: true, options: ['10 Jun, bank transfer', '12 Jun, card'] },
        { name: 'amount', label: 'Amount to refund', type: 'currency', required: true, min: 1, max: 12400, help: 'In US dollars.' },
        { name: 'notify', label: 'Tell the vendor', type: 'checkbox', default: true },
        { name: 'note', label: 'Note for the record', type: 'textarea' },
      ],
    },
    events: ['onSubmit', 'onDecline', 'onCancel', 'onResult'],
  },
  {
    name: 'RunBranches',
    group: 'Judgement',
    summary: 'One run as a tree of saved states, with two ends compared.',
    component: RunBranches,
    props: { title: 'Invoice INV-2291, saved states', checkpoints: checkpointHistory },
  },
  {
    name: 'RunVariants',
    group: 'Judgement',
    summary: 'Many runs grouped by the path they took.',
    component: RunVariants,
    props: { title: 'Invoice runs, by path', runs: variantRuns, plan: variantPlan },
  },

  // Workspace
  {
    name: 'RunTheatre',
    group: 'Workspace',
    summary: 'A run played back as a build. Press Play, or use the arrow keys.',
    component: RunTheatre,
    props: { title: 'Invoice INV-2291, step by step', stages: theatreStages, autoplay: false, intervalMs: 3200 },
  },
  {
    name: 'SealedRecord',
    group: 'Workspace',
    summary: 'The end of a run as a seal, with figures that count up.',
    component: SealedRecord,
    props: { title: 'Run sealed', sealedText: 'Sealed to the record by the controller.', stats: theatreTotals, animate: true },
    events: ['onSave'],
  },
  {
    name: 'RunInspector',
    group: 'Workspace',
    summary: 'One run in four views, with the four questions answered first.',
    component: RunInspector,
    props: { title: 'Invoice INV-2291, run 8f3a', spans: traceSpans, plan: planSteps, actual: actualSteps, evidence: evidenceRows },
  },
  {
    name: 'ApprovalWorkspace',
    group: 'Workspace',
    summary: 'The queue with the chain, evidence and handoff for the request in view.',
    component: ApprovalWorkspace,
    props: { title: 'Approvals waiting', items: [], reviewer: 'raj', now: NOW_ISO },
    events: ['onDecide', 'onEdit'],
    load: async () => {
      const queue = await buildQueue(planDigest);
      return { items: queue.map((q) => ({ queue: q, ...(workspaceExtras[q.id] ?? {}) })) };
    },
  },
  {
    name: 'AutonomyBoard',
    group: 'Workspace',
    summary: 'Every agent in one list, with what needs a look first.',
    component: AutonomyBoard,
    props: { title: 'Agents in production', agents: fleetAgents, now: '2026-06-10T12:00:00Z' },
  },
  {
    name: 'RecordViewer',
    group: 'Workspace',
    summary: 'One record on one page: verdict, guarantees, events and chain.',
    component: RecordViewer,
    props: { title: 'Engagement record', result: null, manifest: record.manifest },
    load: async () => ({ result: await verified() }),
  },
];

export const groups: Group[] = ['Workflow', 'Record', 'Complex', 'Judgement', 'Workspace'];
