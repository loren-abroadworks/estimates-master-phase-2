'use client';

/*
  Arrow-style stage tracker (CRM Part 2, Oct 14 call: Tim's original design).
  Each stage is a chevron that points into the next; stages light up as the
  lead moves: done stages carry a check, the current stage is the strongest.

  palette:
  - 'stage': each stage in its own pipeline colour (multi-colour).
  - 'brand': Estimate Master blue for every reached stage.
  Tim is still choosing between the two, so the lead and contact pages offer
  a switch (components/leads/PipelineTrackers.tsx).

  A long pipeline scrolls sideways inside the tracker; the page never does.
*/
import { Check } from 'lucide-react';
import { cn, inkOn } from '@/lib/utils';
import type { TrackerStep } from './StageTracker';

export type ArrowPalette = 'stage' | 'brand';

const NOTCH = 18; // px: depth of the point and of the notch it fits into

const BRAND_DONE = 'var(--color-primary-500)';
const BRAND_NOW = 'var(--color-primary-700)';

export function ArrowStageTracker({ steps, current, onSelect, disabled, label, palette = 'brand', className }: {
  steps: TrackerStep[];
  /** Id of the current stage; undefined = not started. */
  current?: string;
  onSelect?: (step: TrackerStep) => void;
  disabled?: boolean;
  label: string;
  palette?: ArrowPalette;
  className?: string;
}) {
  const at = steps.findIndex((s) => s.id === current);
  const clickable = !!onSelect && !disabled;
  return (
    <div className={cn('overflow-x-auto pb-1', className)}>
      <ol className="flex min-w-max" aria-label={label}>
        {steps.map((s, i) => {
          const done = at >= 0 && i < at;
          const now = i === at;
          const reached = done || now;
          const first = i === 0;
          const last = i === steps.length - 1;
          // Point on the right (not on the last), notch on the left (not on the first).
          const clip = `polygon(0 0, ${last ? '100%' : `calc(100% - ${NOTCH}px)`} 0, 100% 50%, ${last ? '100%' : `calc(100% - ${NOTCH}px)`} 100%, 0 100%, ${first ? '0' : `${NOTCH}px`} 50%)`;
          const fill = !reached ? undefined : palette === 'brand' ? (now ? BRAND_NOW : BRAND_DONE) : s.color;
          const Tag = clickable ? 'button' : 'div';
          return (
            <li key={s.id} className={cn('relative min-w-[8.5rem] flex-1', !first && '-ml-2.5')} style={{ zIndex: steps.length - i }}>
              <Tag
                {...(clickable
                  ? { type: 'button' as const, onClick: () => onSelect!(s), title: now ? `${s.label} (current)` : `Move to ${s.label}` }
                  : {})}
                aria-current={now ? 'step' : undefined}
                className={cn(
                  'group flex h-12 w-full items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wider transition-[filter,background-color] duration-200 focus:outline-none focus-visible:brightness-90',
                  first ? 'pl-4' : 'pl-7',
                  last ? 'pr-4' : 'pr-7',
                  !reached && 'bg-gray-100 text-gray-500',
                  now && 'text-sm',
                  clickable && (reached ? 'cursor-pointer hover:brightness-110' : 'cursor-pointer hover:bg-gray-200 hover:text-gray-700'),
                )}
                style={{ clipPath: clip, ...(fill ? { backgroundColor: fill, color: palette === 'brand' ? '#fff' : inkOn(s.color) } : {}), ...(reached && !now && palette === 'stage' ? { filter: 'saturate(0.85)' } : {}) }}
              >
                {done && <Check className="size-4 shrink-0 stroke-[3.5]" aria-hidden />}
                <span className="truncate">{s.label}</span>
              </Tag>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
