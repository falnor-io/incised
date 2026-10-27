import { createFileRoute } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { Playground } from '@/playground/Playground';

export const Route = createFileRoute('/playground')({
  head: () => ({ meta: [{ title: 'Playground: Orlune' }] }),
  component: Page,
});

function Page() {
  return (
    <HomeLayout {...baseOptions()}>
      <Playground />
    </HomeLayout>
  );
}
