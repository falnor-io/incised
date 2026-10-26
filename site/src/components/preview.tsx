import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { specimenMeta, specimens, useSpecimenData } from '@/generated/specimens';
import 'orlune/styles.css';

// The components are drawn after mount: several compute from the clock, and a page rendered at build time
// would not match what the browser draws.
export function ComponentPreview({ name, bare = false }: { name: string; bare?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const data = useSpecimenData();
  useEffect(() => setMounted(true), []);
  const reduce = useReducedMotion();
  const render = specimens[name];
  if (!render) return null;
  return (
    <div className={`${bare ? 'orlune-bare' : 'orlune-preview'} not-prose`} data-kind={specimenMeta[name]?.kind}>
      <AnimatePresence initial={false}>
        {mounted ? (
          <motion.div
            key="live"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {render(data)}
          </motion.div>
        ) : (
          <div key="wait" className="orlune-preview-skeleton" aria-hidden="true" />
        )}
      </AnimatePresence>
    </div>
  );
}

// Orlune reads data-theme; Fumadocs sets a "dark" class on <html>. Keep them in step.
export function ThemeBridge() {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.setAttribute('data-theme', root.classList.contains('dark') ? 'dark' : 'light');
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return null;
}
