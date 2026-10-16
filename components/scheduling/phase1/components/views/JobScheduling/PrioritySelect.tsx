import React from 'react';
import { Star, ChevronDown } from 'lucide-react';
import type { JobPriority } from '../../../types';
import { useTranslation } from '../../../i18n/LanguageContext';

export const PRIORITIES: JobPriority[] = ['Low', 'Normal', 'High', 'Urgent'];

// Star + pill colors per priority level.
export const PRIORITY_STYLE: Record<JobPriority, { star: string; pill: string }> = {
  Low: { star: 'text-gray-400 fill-gray-400', pill: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' },
  Normal: { star: 'text-amber-400 fill-amber-400', pill: 'bg-amber-50 dark:bg-amber-900/20 text-gray-700 dark:text-gray-200' },
  High: { star: 'text-orange-500 fill-orange-500', pill: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300' },
  Urgent: { star: 'text-red-500 fill-red-500', pill: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' },
};

/** Read-only priority pill (star + label). */
export const PriorityPill = ({ priority }: { priority: JobPriority }) => {
  const s = PRIORITY_STYLE[priority];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold ${s.pill}`}>
      <Star className={`w-3.5 h-3.5 ${s.star}`} /> {priority}
    </span>
  );
};

/** Editable priority dropdown styled as the colored pill. */
export const PrioritySelect = ({ value, onChange }: { value: JobPriority; onChange: (p: JobPriority) => void }) => {
  const { t } = useTranslation();
  const s = PRIORITY_STYLE[value];
  return (
    <div className="relative inline-flex items-center">
      <Star className={`absolute left-2.5 w-3.5 h-3.5 pointer-events-none ${s.star}`} />
      <select
        aria-label={t('views.JobScheduling.PrioritySelect.priority')}
        value={value}
        onChange={(e) => onChange(e.target.value as JobPriority)}
        className={`appearance-none pl-7 pr-8 py-1 rounded-lg text-sm font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 ${s.pill}`}
      >
        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <ChevronDown className="absolute right-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
    </div>
  );
};
