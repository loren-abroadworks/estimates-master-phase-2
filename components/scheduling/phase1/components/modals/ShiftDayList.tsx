import React from 'react';
import { Trash2, RotateCcw, Undo2 } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

export interface ShiftDayListProps {
  /** Every day in the shift's range, as local 'YYYY-MM-DD', in order. */
  dayKeys: string[];
  /** Days removed from the shift (a subset of dayKeys). A removed day KEEPS its row —
   *  dimmed, and offering a restore — so taking a day out is always visible and always
   *  reversible. Dropping the row instead left no way back except re-picking the dates,
   *  which silently readmitted every other day too. */
  skipDays: string[];
  /** Per-day window overrides; a day absent here uses defaultStart/defaultEnd. */
  dayHours: Record<string, { startTime: string; endTime: string }>;
  defaultStart: string;
  defaultEnd: string;
  /** JS getDay() values treated as weekends, for the Skip weekends action. */
  weekendDays: number[];
  onDeleteDay: (dateKey: string) => void;
  onChangeDayWindow: (dateKey: string, window: { startTime: string; endTime: string }) => void;
  /** Replaces the whole skip list (bulk actions). */
  onSkipAll: (dateKeys: string[]) => void;
  /** Changes the shift's default window. Days without an override follow it by fallback —
   *  this is deliberately NOT a bulk edit of the rows, so hand-set days survive. */
  onChangeDefaultWindow: (window: { startTime: string; endTime: string }) => void;
  /** Drops every per-day override, so all days follow the default again. */
  onClearOverrides: () => void;
  /** Drops one day's override. */
  onResetDay: (dateKey: string) => void;
  /** Puts a removed day back into the shift. */
  onRestoreDay: (dateKey: string) => void;
}

const toH = (t: string) => { const [h, m] = t.split(':').map(Number); return h + (m || 0) / 60; };
const windowHours = (startTime: string, endTime: string) =>
  Math.max(0, Math.round((toH(endTime) - toH(startTime)) * 10) / 10);

// Bare date keys parse as UTC midnight and roll back a day in negative-offset zones.
const atNoon = (key: string) => new Date(`${key}T12:00:00`);

// One grid template shared by the header and every row, so the columns cannot drift apart.
// The day and time columns absorb the extra width; hours and the delete control stay fixed,
// so a 4.0h row and a 12.0h row put their trash icon in the same place.
const ROW_COLS = 'grid grid-cols-[minmax(7rem,1.4fr)_minmax(6rem,1fr)_minmax(6rem,1fr)_9rem_2rem] items-center gap-3';

const TIME_INPUT =
  'w-full p-1.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-200 ' +
  'dark:border-gray-700 rounded-md text-xs outline-none focus:ring-2 focus:ring-primary-400/20 focus:border-primary-400';

const COL_HEAD = 'text-[10px] font-black text-gray-400 uppercase tracking-widest';

export const ShiftDayList = ({
  dayKeys, skipDays, dayHours, defaultStart, defaultEnd, weekendDays,
  onDeleteDay, onChangeDayWindow, onSkipAll, onChangeDefaultWindow, onClearOverrides, onResetDay, onRestoreDay,
}: ShiftDayListProps) => {
  const { t } = useTranslation();
  const windowFor = (key: string) => dayHours[key] ?? { startTime: defaultStart, endTime: defaultEnd };
  const workedDays = dayKeys.filter(k => !skipDays.includes(k));
  // A day is "custom" only when its override actually READS differently from the default.
  // An override that happens to equal the default is invisible to the user, so badging it
  // would be noise — and it lets a default change look like it did nothing.
  const isCustom = (key: string) => {
    const o = dayHours[key];
    return !!o && (o.startTime !== defaultStart || o.endTime !== defaultEnd);
  };
  const anyCustom = workedDays.some(isCustom);
  // Removing the last day would leave a shift that works nothing, recoverable only by
  // widening the dates. Disable rather than allow the dead end.
  const canDelete = workedDays.length > 1;

  return (
    <div className="mt-4">
      {/* The default window every day falls back to. Editing it moves each untouched day;
          days set by hand keep their times and say so, so nothing is silently overwritten. */}
      <div className={`${ROW_COLS} px-2.5 pb-2.5`}>
        <span className={COL_HEAD}>{t('modals.CrewSelectionModal.defaultColumn')}</span>
        <input
          type="time"
          aria-label={t('modals.CrewSelectionModal.defaultStart')}
          value={defaultStart}
          onChange={e => onChangeDefaultWindow({ startTime: e.target.value, endTime: defaultEnd })}
          className={TIME_INPUT}
        />
        <input
          type="time"
          aria-label={t('modals.CrewSelectionModal.defaultEnd')}
          value={defaultEnd}
          onChange={e => onChangeDefaultWindow({ startTime: defaultStart, endTime: e.target.value })}
          className={TIME_INPUT}
        />
        <span className="col-span-2 justify-self-end">
          {anyCustom && (
            <button
              type="button"
              onClick={onClearOverrides}
              className="text-[11px] font-bold text-primary-600 dark:text-primary-400 hover:underline whitespace-nowrap"
            >
              {t('modals.CrewSelectionModal.applyToAll')}
            </button>
          )}
        </span>
      </div>

      {/* Column headers make the full width deliberate — without them the row content reads
          as stranded at either end of a too-wide strip. */}
      <div className={`${ROW_COLS} px-2.5 pb-1.5 border-b border-gray-200 dark:border-gray-700`}>
        <span className={COL_HEAD}>{t('modals.CrewSelectionModal.dayColumn')}</span>
        <span className={COL_HEAD}>{t('modals.CrewSelectionModal.startColumn')}</span>
        <span className={COL_HEAD}>{t('modals.CrewSelectionModal.endColumn')}</span>
        <span className={`${COL_HEAD} text-right`}>{t('modals.CrewSelectionModal.hoursColumn')}</span>
        <span />
      </div>

      <div className="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-gray-100 dark:divide-gray-800">
        {dayKeys.map(key => {
          const w = windowFor(key);
          const dayLabel = atNoon(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
          if (skipDays.includes(key)) {
            return (
              <div key={key} className={`${ROW_COLS} px-2.5 py-1.5 opacity-60`}>
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 line-through">{dayLabel}</span>
                <span className="col-span-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {t('modals.CrewSelectionModal.removedDay')}
                </span>
                <button
                  type="button"
                  aria-label={t('modals.CrewSelectionModal.restoreDay')}
                  onClick={() => onRestoreDay(key)}
                  className="p-1 rounded-md justify-self-end text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          }
          return (
            <div key={key} className={`${ROW_COLS} px-2.5 py-1.5`}>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{dayLabel}</span>
              <input
                type="time"
                value={w.startTime}
                onChange={e => onChangeDayWindow(key, { ...w, startTime: e.target.value })}
                className={TIME_INPUT}
              />
              <input
                type="time"
                value={w.endTime}
                onChange={e => onChangeDayWindow(key, { ...w, endTime: e.target.value })}
                className={TIME_INPUT}
              />
              <span className="flex items-center justify-end gap-1.5 min-w-0">
                <span className="text-[11px] font-bold tabular-nums text-gray-500 dark:text-gray-400">
                  {windowHours(w.startTime, w.endTime).toFixed(1)}h
                </span>
                {isCustom(key) && (
                  <>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 whitespace-nowrap">
                      {t('modals.CrewSelectionModal.customDay')}
                    </span>
                    <button
                      type="button"
                      aria-label={t('modals.CrewSelectionModal.resetToDefault')}
                      onClick={() => onResetDay(key)}
                      className="p-0.5 rounded text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </>
                )}
              </span>
              <button
                type="button"
                disabled={!canDelete}
                aria-label={t('modals.CrewSelectionModal.removeDay')}
                onClick={() => canDelete && onDeleteDay(key)}
                className={`p-1 rounded-md justify-self-end ${canDelete
                  ? 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : 'text-gray-200 dark:text-gray-700 cursor-not-allowed'}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onSkipAll(dayKeys.filter(k => weekendDays.includes(atNoon(k).getDay())))}
        className="mt-2 text-[11px] font-bold text-primary-600 dark:text-primary-400 hover:underline"
      >
        {t('modals.CrewSelectionModal.skipWeekends')}
      </button>
    </div>
  );
};
