import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Native disclosure keeps section contents mounted while collapsed. */
export function DatasetSection({ title, children, enabled = true }: { title: string; children: ReactNode; enabled?: boolean }) {
  if (!enabled) return <>{children}</>;
  return <details className="group/dataset-section mt-4 rounded-2xl border border-border bg-card shadow-sm">
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open/dataset-section:rotate-180" />
    </summary>
    <div className="border-t border-border">{children}</div>
  </details>;
}
