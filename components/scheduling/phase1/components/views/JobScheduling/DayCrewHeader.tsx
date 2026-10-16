import React from 'react';
import type { DayTotal } from '../../../services/crewHoursGrid';
import { WeatherIcon } from './WeatherIcon';
import type { WeatherKind } from '../../../types';
import { useTranslation } from '../../../i18n/LanguageContext';

const dayLabel = (key: string) => {
  const d = new Date(`${key}T12:00:00`);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: d.toLocaleDateString(undefined, { day: 'numeric' }),
  };
};

interface DayCrewHeaderProps {
  dayKey: string;
  /** Forecast by local date key, shown beside the date. */
  weather?: Record<string, WeatherKind>;
  /** Whole-crew assigned / capacity for the day. Omit (or null) to hide it — e.g.
   *  the Board day view shows the date header without the crew total. */
  total?: DayTotal | null;
}

/** The header strip above the Day crew timeline: the weekday + date (with weather)
 *  on the left, and optionally the whole-crew hours total on the right. */
export const DayCrewHeader = ({ dayKey, weather, total }: DayCrewHeaderProps) => {
  const { t } = useTranslation();
  const { weekday, day } = dayLabel(dayKey);
  const over = total ? total.assigned > total.capacity : false;
  return (
    <div className="mb-3 flex items-center justify-between gap-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{weekday}</span>
        <span className="text-base font-bold text-gray-900 dark:text-white">{day}</span>
        <WeatherIcon kind={weather?.[dayKey]} className="w-4 h-4" />
      </div>
      {total && (
        <div className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{t('views.JobScheduling.DayCrewHeader.crewTotal')}</span>
          <span className={`text-sm font-extrabold tabular-nums ${over ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{total.assigned} / {total.capacity}h</span>
          {over
            ? <span className="text-[11px] font-bold text-red-500">+{Math.round((total.assigned - total.capacity) * 10) / 10}h</span>
            : <span className="text-[11px] text-gray-400">{t('views.JobScheduling.DayCrewHeader.hoursFree', { hours: Math.round((total.capacity - total.assigned) * 10) / 10 })}</span>}
        </div>
      )}
    </div>
  );
};
