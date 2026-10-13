'use client';

/*
  Stage tracker: circles joined by a line, one per stage, label under each.
  Taken from Job Progress (components/jobs/JobDetailCards.tsx), which now
  uses it too, and sized up for CRM Part 2 (10): 38px circles, a 4px line,
  a check on done stages, and the stage colour on done and current stages.
  A long pipeline scrolls sideways inside the tracker; the page never does.
  Used on Job Details, lead details, the contact page and the Pipeline
  Stages preview.
*/
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TrackerStep {
  id: string;
  label: string;
  color: string;
}

const GREY = 'var(--color-gray-200)';

export function StageTracker({ steps, current, onSelect, disabled, label, className }: {
  steps: TrackerStep[];
  /** Id of the current stage; undefined = not started. */
  current?: string;
  /** Clicking a stage. Left out (or disabled) = read only. */
  onSelect?: (step: TrackerStep) => void;
  disabled?: boolean;
  /** Accessible name, e.g. "Sales stages". */
  label: string;
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
          const Tag = clickable ? 'button' : 'div';
          return (
            <li key={s.id} className="relative flex w-24 shrink-0 flex-col items-center sm:w-28">
              {/* Line to the next stage: coloured once the next stage is reached. */}
              {i < steps.length - 1 && (
                <span aria-hidden className="absolute left-1/2 top-[17px] h-1 w-full rounded-full" style={{ backgroundColor: at > i ? steps[i + 1]!.color : GREY }} />
              )}
              <Tag
                {...(clickable ? { type: 'button' as const, onClick: () => onSelect!(s), 'aria-current': now ? ('step' as const) : undefined, title: now ? `${s.label} (current)` : `Move to ${s.label}` } : { 'aria-current': now ? ('step' as const) : undefined })}
                className={cn(
                  'group relative z-10 flex flex-col items-center gap-2 rounded-lg px-1 outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60',
                  clickable && 'cursor-pointer',
                )}
              >
                <span
                  className={cn(
                    'flex h-[38px] w-[38px] items-center justify-center rounded-full border-4 transition-all',
                    !reached && 'border-gray-200 bg-white text-gray-300',
                    now && 'shadow-md ring-2 ring-offset-2 ring-offset-transparent',
                    clickable && !now && 'group-hover:scale-105',
                  )}
                  style={reached ? { backgroundColor: s.color, borderColor: s.color, color: '#fff', ...(now ? { ['--tw-ring-color' as string]: s.color } : {}) } : undefined}
                >
                  {done ? <Check className="h-4 w-4 stroke-[4]" /> : now ? <span className="h-2.5 w-2.5 rounded-full bg-[#fff]" /> : <span className="h-2 w-2 rounded-full bg-gray-200" />}
                </span>
                <span className={cn('max-w-[6.5rem] text-center text-xxs font-black uppercase leading-tight tracking-wider', now ? 'text-gray-900' : reached ? 'text-gray-700' : 'text-gray-500 group-hover:text-gray-700')}>
                  {s.label}
                </span>
              </Tag>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
