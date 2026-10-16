import React from 'react';
import { Plus, Trash2, Users, Pencil, ChevronRight } from 'lucide-react';
import { Button } from '../../UI';
import { JobCrewAllocation, CrewMember } from '../../../types';
import { CrewAvatar } from './CrewAvatar';
import { allocDayWindow, allocWorkedDayKeys, memberDayWindow } from '../../../services/scheduleEngine';
import { fmtClock } from '../../../services/productionBoard';
import { useTranslation } from '../../../i18n/LanguageContext';

interface ShiftListProps {
  allocations: JobCrewAllocation[];
  allStaff: CrewMember[];
  weekendDays: number[];
  /** When false, the delete control on every card is disabled (e.g. the last shift). */
  canDelete?: boolean;
  /** Open the full editor modal for this shift (name, dates, times, crew). */
  onEditMembers: (shiftId: string) => void;
  onAddShift: () => void;
  onDeleteShift: (shiftId: string) => void;
  // Legacy inline-edit callbacks. The card is now read-only (edits happen in the modal
  // opened via onEditMembers), so these are unused — kept optional so existing callers
  // compile unchanged.
  onRenameShift?: (shiftId: string, name: string) => void;
  onChangeSpan?: (shiftId: string, startDate: string, endDate: string) => void;
  onChangeDayWindow?: (shiftId: string, dateKey: string, window: { startTime: string; endTime: string }) => void;
}

export const ShiftList = ({
  allocations, allStaff, weekendDays, canDelete = true, onEditMembers, onAddShift, onDeleteShift,
}: ShiftListProps) => {
  const { t } = useTranslation();
  // Days expanded to their per-member breakdown, keyed '<shiftId>:<dateKey>' so the same
  // date in two shifts opens independently. Collapsed is the default: a divergent day is
  // the exception, and the card should stay scannable until you ask about one.
  const [openDays, setOpenDays] = React.useState<Set<string>>(new Set());
  const toggleDay = (key: string) => setOpenDays(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const nameOf = (id: string) => allStaff.find(m => m.id === id)?.name ?? id;
  // Anchor date-only strings at local noon: a bare 'YYYY-MM-DD' parses as UTC midnight
  // and rolls back a day in negative-offset zones, dropping the last day.
  const atNoon = (d: string) => (d.includes('T') ? d : `${d}T12:00:00`);
  const fmtDay = (d: string) => new Date(atNoon(d)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className="space-y-3">
      {allocations.map(alloc => {
        const days = allocWorkedDayKeys(alloc, weekendDays);
        const rangeLabel = alloc.startDate === alloc.endDate
          ? fmtDay(alloc.startDate)
          : `${fmtDay(alloc.startDate)} – ${fmtDay(alloc.endDate)}`;
        return (
          <div key={alloc.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-3">
            {/* Header: shift name + Edit / Delete. A pinned shift is history — it carries a
                Worked badge and no controls, because moving or deleting it would destroy the
                only record that the work happened. */}
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate font-bold text-gray-900 dark:text-white">{alloc.name || 'Shift'}</span>
              {alloc.pinned ? (
                <span
                  title={t('views.JobScheduling.ShiftList.workedHint')}
                  className="text-[11px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
                >{t('views.JobScheduling.ShiftList.worked')}</span>
              ) : (
                <>
                  <button onClick={() => onEditMembers(alloc.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-600 dark:text-primary-400 hover:underline whitespace-nowrap">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button aria-label="Delete shift" disabled={!canDelete} onClick={() => canDelete && onDeleteShift(alloc.id)}
                    className={`p-1.5 rounded-lg ${canDelete ? 'text-gray-400 hover:text-red-600' : 'text-gray-200 dark:text-gray-700 cursor-not-allowed'}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {/* Date range (read-only) */}
            <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{rangeLabel}</div>

            {/* Members (read-only) */}
            <div className="flex flex-wrap gap-1.5 min-w-0">
              {alloc.memberIds.length
                ? alloc.memberIds.map(id => {
                    const member = allStaff.find(s => s.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-700 rounded-full pl-0.5 pr-2 py-0.5">
                        <CrewAvatar m={member ?? { id, name: nameOf(id) }} size="xs" />
                        {nameOf(id).split(' ')[0]}
                      </span>
                    );
                  })
                : <span className="text-xs text-gray-400 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Unassigned</span>}
            </div>

            {/* Per-day hours (read-only). A day where the whole crew shares one window
                stays a single line; a day where somebody was given their own hours splits
                into a line per member, so a divergence is what draws the eye. */}
            <div className="space-y-1.5">
              {days.map(dateKey => {
                const shiftWindow = allocDayWindow(alloc, dateKey);
                const label = new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                const memberWindows = alloc.memberIds.map(id => ({ id, w: memberDayWindow(alloc, id, dateKey) }));
                const split = memberWindows.length > 1 && memberWindows.some(
                  ({ w }) => w.startTime !== memberWindows[0].w.startTime || w.endTime !== memberWindows[0].w.endTime,
                );
                // Unassigned, or one crew, or everyone aligned: show the window they share.
                const sharedWindow = memberWindows[0]?.w ?? shiftWindow;
                if (!split) {
                  return (
                    <div key={dateKey} className="flex items-center gap-2 text-sm">
                      <span className="w-24 shrink-0 text-gray-500 dark:text-gray-400">{label}</span>
                      <span className="tabular-nums text-gray-700 dark:text-gray-200">{fmtClock(sharedWindow.startTime)} – {fmtClock(sharedWindow.endTime)}</span>
                    </div>
                  );
                }
                // The day's overall span: earliest anyone starts to latest anyone finishes.
                // Zero-padded 'HH:mm' orders correctly as a string, so no parsing needed.
                const spanStart = memberWindows.reduce((a, { w }) => (w.startTime < a ? w.startTime : a), memberWindows[0].w.startTime);
                const spanEnd = memberWindows.reduce((a, { w }) => (w.endTime > a ? w.endTime : a), memberWindows[0].w.endTime);
                // Count DISTINCT windows, not members: three people on two schedules is
                // "2 times", which is what the reader actually needs to know.
                const distinct = new Set(memberWindows.map(({ w }) => `${w.startTime}-${w.endTime}`)).size;
                const openKey = `${alloc.id}:${dateKey}`;
                const isOpen = openDays.has(openKey);
                const panelId = `shift-day-${alloc.id}-${dateKey}`;
                return (
                  <div key={dateKey} className="space-y-1">
                    <button type="button" onClick={() => toggleDay(openKey)}
                      aria-expanded={isOpen} aria-controls={panelId}
                      className="w-full flex items-center gap-2 text-sm text-left rounded-lg -mx-1 px-1 py-0.5 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      <span className="w-[5.25rem] shrink-0 text-gray-500 dark:text-gray-400">{label}</span>
                      <span className="tabular-nums text-gray-700 dark:text-gray-200">{fmtClock(spanStart)} – {fmtClock(spanEnd)}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">· {distinct} times</span>
                    </button>
                    {isOpen && (
                      <div id={panelId} className="space-y-1">
                        {memberWindows.map(({ id, w }) => (
                          <div key={id} data-testid={`member-day-${id}-${dateKey}`} className="flex items-center gap-2 pl-[1.375rem] text-sm">
                            <span className="w-[5.25rem] shrink-0 truncate text-gray-500 dark:text-gray-400">{nameOf(id).split(' ')[0]}</span>
                            <span className="tabular-nums text-gray-700 dark:text-gray-200">{fmtClock(w.startTime)} – {fmtClock(w.endTime)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <Button variant="secondary" onClick={onAddShift} className="w-full justify-center">
        <Plus className="w-4 h-4" /> Add shift
      </Button>
    </div>
  );
};
