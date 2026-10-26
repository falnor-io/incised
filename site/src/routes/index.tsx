import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { ComponentPreview } from '@/components/preview';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';

export const Route = createFileRoute('/')({
  component: Home,
});

const button =
  'inline-flex items-center rounded-full px-5 py-2.5 text-sm font-medium transition-transform duration-200 active:scale-[0.98] hover:-translate-y-px';

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-28 px-5 pb-32 pt-16 md:pt-24">
        {/* Hero: the claim on the left, proof on the right. */}
        <section className="grid items-start gap-12 lg:grid-cols-12">
          <Stagger className="flex flex-col gap-6 lg:col-span-7">
            <StaggerItem>
              <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.15rem]">
                Components for agents that put it in writing.
              </h1>
            </StaggerItem>
            <StaggerItem>
              <p className="max-w-xl text-lg leading-relaxed text-fd-muted-foreground">
                React components that show what an agent did, who approved it, and whether the record was changed.
              </p>
            </StaggerItem>
            <StaggerItem className="flex flex-wrap gap-3">
              <Link to="/docs/$" params={{ _splat: '' }} className={`${button} bg-fd-primary text-fd-background`}>
                Read the docs
              </Link>
              <Link
                to="/docs/$"
                params={{ _splat: 'components' }}
                className={`${button} bg-fd-muted text-fd-foreground`}
              >
                Browse components
              </Link>
            </StaggerItem>
          </Stagger>
          <Reveal delay={0.25} className="flex flex-col gap-4 lg:col-span-5 lg:-mt-6 lg:translate-x-4">
            <ComponentPreview name="VerifyStatus-tampered" />
            <ComponentPreview name="ConfidenceBar" />
          </Reveal>
        </section>

        {/* What it refuses to do: four cells for four things, in different tones. */}
        <section className="flex flex-col gap-10">
          <Reveal>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
              The model fills in data. The interface does the rest.
            </h2>
          </Reveal>
          <div className="grid gap-4 lg:grid-cols-6">
            <Reveal className="rounded-3xl bg-fd-card p-6 lg:col-span-4">
              <ComponentPreview name="ApprovalQueue" bare />
              <p className="mt-5 max-w-lg text-fd-muted-foreground">
                An approval is bound to the exact plan. Edit the plan and every earlier approval goes stale.
              </p>
            </Reveal>
            <Reveal delay={0.08} className="flex flex-col justify-between gap-6 rounded-3xl bg-fd-primary/10 p-8 lg:col-span-2">
              <p className="text-2xl font-medium leading-snug tracking-tight">
                Nothing derived comes from a model. Shares, waits, intervals and verdicts are worked out on the page.
              </p>
              <Link
                to="/docs/$"
                params={{ _splat: 'principles' }}
                className="text-sm font-medium text-fd-primary underline-offset-4 hover:underline"
              >
                What each component refuses to do
              </Link>
            </Reveal>
            <Reveal className="rounded-3xl bg-fd-muted p-6 lg:col-span-2">
              <ComponentPreview name="RetestClock" bare />
              <p className="mt-5 text-fd-muted-foreground">Met, missed or time left, from the dates and nothing else.</p>
            </Reveal>
            <Reveal delay={0.08} className="rounded-3xl bg-fd-card p-6 lg:col-span-4">
              <ComponentPreview name="ControlChart" bare />
              <p className="mt-5 max-w-lg text-fd-muted-foreground">
                A signal says look closer, never that something broke. A quiet chart is never called safe.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Where it sits */}
        <section className="flex flex-col gap-8">
          <Reveal>
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight md:text-4xl">Use it next to your chat library.</h2>
            <p className="mt-4 max-w-xl text-fd-muted-foreground">
              Chat libraries draw the conversation. Orlune draws what a person opens afterwards to decide, review or prove.
            </p>
          </Reveal>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ['Timing, tokens and cost across an agent run', 'Trace explorer'],
              ['A person approving an action', 'Approval queue'],
              ['Proof a record was not changed', 'Verify status'],
              ['Whether a model release made things worse', 'Eval matrix'],
            ].map(([need, use], i) => (
              <Reveal key={use} delay={i * 0.06} className="card-lift flex items-baseline justify-between gap-6 rounded-2xl bg-fd-card px-6 py-5">
                <span className="text-fd-muted-foreground">{need}</span>
                <span className="whitespace-nowrap font-medium">{use}</span>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Install */}
        <Reveal className="flex flex-col items-start gap-6 rounded-3xl bg-fd-card p-10 md:p-14">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Copy one in.</h2>
          <code className="rounded-xl bg-fd-muted px-4 py-3 font-mono text-sm">
            npx shadcn@latest add falnor-io/orlune/approval-queue
          </code>
          <p className="max-w-md text-fd-muted-foreground">The files land in your project. You own them and can edit them.</p>
          <Link to="/docs/$" params={{ _splat: '' }} className={`${button} bg-fd-primary text-fd-background`}>
            Read the docs
          </Link>
        </Reveal>

        <footer className="text-sm text-fd-muted-foreground">
          Orlune is MIT licensed and built by{' '}
          <a href="https://falnor.io" className="text-fd-foreground underline-offset-4 hover:underline">
            Falnor
          </a>
          .
        </footer>
      </main>
    </HomeLayout>
  );
}
