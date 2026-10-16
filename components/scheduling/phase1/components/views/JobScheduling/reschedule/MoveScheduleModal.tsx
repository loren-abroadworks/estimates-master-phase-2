import React, { useState } from 'react';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { Modal, Button } from '../../../UI';
import { useTranslation } from '../../../../i18n/LanguageContext';

/** One shift as the move would leave it. A pinned (worked) shift is listed with the same
 *  dates on both sides — it says plainly that it stays where it is. */
export interface MoveScheduleRow {
  id: string;
  name: string;
  pinned?: boolean;
  from: { startDate: string; endDate: string };
  to: { startDate: string; endDate: string };
}

interface MoveScheduleModalProps {
  isOpen: boolean;
  /** Where every shift lands for a signed day count (negative = earlier), with the
   *  shifts in `skipShiftIds` left where they are. */
  preview: (days: number, skipShiftIds: string[]) => MoveScheduleRow[];
  onClose: () => void;
  /** Commit the move. Same arguments the preview was built from. */
  onMove: (days: number, skipShiftIds: string[]) => void;
}

const MAX_DAYS = 60;

// A bare 'YYYY-MM-DD' parses as UTC midnight and rolls back a day in negative-offset
// zones, so date-only strings are anchored at local noon.
const atNoon = (d: string) => (d.includes('T') ? d : `${d}T12:00:00`);
const fmtDay = (d: string) => new Date(atNoon(d)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtRange = (r: { startDate: string; endDate: string }) =>
  (r.startDate === r.endDate ? fmtDay(r.startDate) : `${fmtDay(r.startDate)} – ${fmtDay(r.endDate)}`);

/**
 * Move a whole job by N working days, in one place: which way, how far, and where every
 * shift lands. The list is the point — a day count alone doesn't answer "so what date is
 * Paint on now?", and that is the question being asked.
 */
export const MoveScheduleModal = ({ isOpen, preview, onClose, onMove }: MoveScheduleModalProps) => {
  const { t } = useTranslation();
  const [later, setLater] = useState(true);
  // Held as a string so the field can be emptied mid-retype.
  const [raw, setRaw] = useState('1');
  // Shifts the user unticked. Tracked as the exclusions rather than the selection so the
  // default — everything moves — needs no knowledge of the shift list to state.
  const [skipped, setSkipped] = useState<string[]>([]);

  const days = Math.min(MAX_DAYS, Math.max(1, Math.round(Number(raw) || 0)));
  const signed = later ? days : -days;
  const rows = isOpen ? preview(signed, skipped) : [];
  const choosable = rows.filter(r => !r.pinned);
  const moving = choosable.filter(r => !skipped.includes(r.id));

  const toggle = (id: string) => setSkipped(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const directionBtn = (isLater: boolean, label: string) => (
    <button
      type="button"
      onClick={() => setLater(isLater)}
      aria-pressed={later === isLater}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
        later === isLater
          ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-300 shadow-sm'
          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
      }`}
    >
      {label}
    </button>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('views.JobScheduling.MoveScheduleModal.title')} maxWidth="md:max-w-lg">
      <div className="space-y-5">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-gray-400">
              {t('views.JobScheduling.MoveScheduleModal.direction')}
            </span>
            <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-900 p-1">
              {directionBtn(false, t('views.JobScheduling.MoveScheduleModal.earlier'))}
              {directionBtn(true, t('views.JobScheduling.MoveScheduleModal.later'))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="move-days" className="block text-[11px] font-black uppercase tracking-[0.12em] text-gray-400">
              {t('views.JobScheduling.MoveScheduleModal.byHowMany')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="move-days"
                type="number"
                min={1}
                max={MAX_DAYS}
                value={raw}
                onChange={e => setRaw(e.target.value)}
                onBlur={() => setRaw(String(days))}
                className="w-20 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-center text-base font-bold tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xs font-semibold text-gray-400 whitespace-nowrap">
                {t('views.JobScheduling.MoveScheduleModal.workingDays')}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-gray-400">
              {t('views.JobScheduling.MoveScheduleModal.shifts')}
            </span>
            {choosable.length > 1 && (
              <span className="text-[11px] font-bold text-gray-400 tabular-nums">
                {t('views.JobScheduling.MoveScheduleModal.movingCount', { moving: moving.length, total: choosable.length })}
              </span>
            )}
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map(row => {
              const name = row.name || t('views.JobScheduling.MoveScheduleModal.unnamedShift');
              const out = skipped.includes(row.id);
              // A worked shift is not a choice — it has no tick, and its date is stated once.
              if (row.pinned) {
                return (
                  <div key={row.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="w-4 shrink-0" aria-hidden />
                    <span className="flex-1 min-w-0 truncate text-sm font-bold text-gray-500 dark:text-gray-400">{name}</span>
                    <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">{fmtRange(row.from)}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                      {t('views.JobScheduling.MoveScheduleModal.stays')}
                    </span>
                  </div>
                );
              }
              return (
                <label key={row.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={!out}
                    onChange={() => toggle(row.id)}
                    aria-label={t('views.JobScheduling.MoveScheduleModal.moveShift', { name })}
                    className="w-4 h-4 shrink-0 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-400"
                  />
                  <span className={`flex-1 min-w-0 truncate text-sm font-bold ${out ? 'text-gray-400' : 'text-gray-900 dark:text-white'}`}>{name}</span>
                  {out ? (
                    // Left out: its dates stand as they are, with nothing to compare them to.
                    <span className="text-sm tabular-nums text-gray-400">{fmtRange(row.from)}</span>
                  ) : (
                    <>
                      <span className="text-sm tabular-nums text-gray-400 line-through">{fmtRange(row.from)}</span>
                      <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                      <span className="text-sm font-bold tabular-nums text-primary-600 dark:text-primary-400">{fmtRange(row.to)}</span>
                    </>
                  )}
                </label>
              );
            })}
            {rows.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-400">{t('views.JobScheduling.MoveScheduleModal.noShifts')}</p>
            )}
          </div>
          {rows.some(r => r.pinned) && (
            <p className="text-[11px] text-gray-400">{t('views.JobScheduling.MoveScheduleModal.workedNote')}</p>
          )}
          {moving.length === 0 && choosable.length > 0 && (
            <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              {t('views.JobScheduling.MoveScheduleModal.noneSelected')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            {t('views.JobScheduling.MoveScheduleModal.cancel')}
          </Button>
          <Button
            onClick={() => { onMove(signed, skipped); onClose(); }}
            disabled={moving.length === 0}
            className="flex-1"
          >
            <CalendarClock className="w-4 h-4" />
            {later
              ? t('views.JobScheduling.MoveScheduleModal.confirmLater', { days })
              : t('views.JobScheduling.MoveScheduleModal.confirmEarlier', { days })}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
