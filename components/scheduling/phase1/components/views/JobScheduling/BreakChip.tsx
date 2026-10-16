import React from 'react';
import { Coffee } from 'lucide-react';
import type { CrewBreak } from '../../../types';
import { fmtClock } from '../../../services/productionBoard';
import { useTranslation } from '../../../i18n/LanguageContext';

/** A compact single-line break pill for the crew views: icon, name, duration · time,
 *  and a paid/unpaid dot (full text in the tooltip). `floating` adds a dashed border
 *  for flexible (un-timed) breaks. Click (when onClick is set) opens the break editor. */
export const BreakChip = ({ brk, floating = false, onClick }: {
  brk: CrewBreak;
  floating?: boolean;
  onClick?: () => void;
}) => {
  const { t } = useTranslation();
  const mins = brk.durationMinutes;
  const dur = mins % 60 === 0 ? `${mins / 60}h` : `${mins}m`;
  const timeOrFlex = brk.startTime ? fmtClock(brk.startTime) : t('views.JobScheduling.BreakChip.flexible');
  const label = brk.label || t('views.JobScheduling.BreakChip.break');
  const paidText = brk.paid ? t('views.JobScheduling.BreakChip.paid') : t('views.JobScheduling.BreakChip.unpaid');
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      title={`${label} · ${dur} · ${timeOrFlex} · ${paidText}`}
      className={`w-full flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-left text-[10px] leading-tight bg-gray-50 dark:bg-gray-700/60 border-gray-200 dark:border-gray-600 ${
        floating ? 'border-dashed' : ''
      } ${onClick ? 'hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer' : ''}`}
    >
      <Coffee className="w-3 h-3 shrink-0 text-gray-500 dark:text-gray-400" />
      <span className="truncate font-bold text-gray-700 dark:text-gray-200">{label}</span>
      <span className="truncate text-gray-500 dark:text-gray-400">· {dur} · {timeOrFlex}</span>
    </Tag>
  );
};
