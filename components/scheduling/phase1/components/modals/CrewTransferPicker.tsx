import React, { useState, useMemo } from 'react';
import { Search, Plus, X, Crown } from 'lucide-react';
import { CrewMember, Job } from '../../types';
import { computeWeeklyCapacity, type HoursAssignments } from '../../services/shiftCapacity';
import { Button } from '../UI';
import { useTranslation } from '../../i18n/LanguageContext';

interface CrewTransferPickerProps {
  allStaff: CrewMember[];
  selectedIds: string[];
  leaderId: string | null;
  weekDays: Date[];
  existingJobs: Job[];
  excludeJobId?: string;
  /** The shift being edited — its saved copy must not be counted alongside the draft. */
  excludeAllocationId?: string;
  /** The editor's draft per-day hours, so this panel counts the shift being filled in. */
  hoursAssignments?: HoursAssignments;
  weekendDays: number[];
  standardDay: number;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onSetLeader: (id: string) => void;
  onDone: () => void;
  /** Discards every add/remove made in this panel and returns to the shift editor. */
  onCancel: () => void;
}

export const CrewTransferPicker = ({
  allStaff,
  selectedIds,
  leaderId,
  weekDays,
  existingJobs,
  excludeJobId,
  excludeAllocationId,
  hoursAssignments = {},
  weekendDays,
  standardDay,
  onAdd,
  onRemove,
  onSetLeader,
  onDone,
  onCancel,
}: CrewTransferPickerProps) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const available = useMemo(
    () =>
      allStaff.filter(
        (s) =>
          !selectedIds.includes(s.id) &&
          s.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [allStaff, selectedIds, search],
  );

  const added = useMemo(
    () =>
      selectedIds
        .map((id) => allStaff.find((s) => s.id === id))
        .filter(Boolean) as CrewMember[],
    [allStaff, selectedIds],
  );

  // Same roll-up the grid's WEEKLY CAPACITY column renders, so the two panels of the
  // editor never disagree: other jobs plus the draft hours being typed in this shift.
  const CapacityBadge = ({ emp }: { emp: CrewMember }) => {
    const wh = computeWeeklyCapacity(emp, weekDays, existingJobs, hoursAssignments, {
      standardDay,
      excludeJobId,
      excludeAllocationId,
      weekendDays,
    });
    const full = wh.free <= 0;
    return (
      <div className="shrink-0 text-right">
        <div className="text-sm font-black text-gray-900 dark:text-white tabular-nums">
          {wh.assigned}
          <span className="text-gray-400 font-bold">/{wh.capacity}h</span>
        </div>
        <div className={`text-[11px] font-bold ${full ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
          {full
            ? t('modals.CrewSelectionModal.fullyBooked')
            : t('modals.CrewSelectionModal.hoursLeft', { remaining: wh.free })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search (filters the Available panel) */}
      <div className="relative mb-4 flex-shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('modals.CrewSelectionModal.searchPlaceholder')}
          className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-400 dark:border-gray-500 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Two panels */}
      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        {/* Available */}
        <section
          aria-label={t('modals.CrewSelectionModal.available')}
          className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 overflow-hidden"
        >
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {t('modals.CrewSelectionModal.available')}
            </span>
            <span className="text-xs font-bold text-gray-400">{available.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-gray-100 dark:divide-gray-700">
            {available.map((emp) => (
              <div
                key={emp.id}
                className="p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <img src={emp.photo} className="w-9 h-9 rounded-full bg-gray-100 object-cover" alt="" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-200 truncate">{emp.name}</span>
                  <span className="text-[11px] text-gray-400 font-medium">{emp.role}</span>
                </div>
                <CapacityBadge emp={emp} />
                <button
                  aria-label={`${t('modals.CrewSelectionModal.add')} ${emp.name}`}
                  onClick={() => onAdd(emp.id)}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('modals.CrewSelectionModal.add')}
                </button>
              </div>
            ))}
            {available.length === 0 && (
              <div className="py-12 text-center text-xs text-gray-400">
                {t('modals.CrewSelectionModal.noMatchingStaff')}
              </div>
            )}
          </div>
        </section>

        {/* Added */}
        <section
          aria-label={t('modals.CrewSelectionModal.added')}
          className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 overflow-hidden"
        >
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {t('modals.CrewSelectionModal.added')}
            </span>
            <span className="text-xs font-bold text-gray-400">{added.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-gray-100 dark:divide-gray-700">
            {added.map((emp) => {
              const isLeader = emp.id === leaderId;
              return (
                <div
                  key={emp.id}
                  className="p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <img src={emp.photo} className="w-9 h-9 rounded-full bg-gray-100 object-cover" alt="" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{emp.name}</span>
                    <span className="text-[11px] text-gray-400 font-medium">{emp.role}</span>
                  </div>
                  <CapacityBadge emp={emp} />
                  <button
                    aria-label={`${t('modals.CrewSelectionModal.makeLeader')} ${emp.name}`}
                    aria-pressed={isLeader}
                    onClick={() => onSetLeader(emp.id)}
                    className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                      isLeader
                        ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
                        : 'text-gray-300 dark:text-gray-600 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                    }`}
                  >
                    <Crown className="w-4 h-4 fill-current" />
                  </button>
                  <button
                    aria-label={`${t('modals.CrewSelectionModal.remove')} ${emp.name}`}
                    onClick={() => onRemove(emp.id)}
                    className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            {added.length === 0 && (
              <div className="py-12 text-center text-xs text-gray-400">
                {t('modals.CrewSelectionModal.noCrewAdded')}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="pt-4 mt-auto border-t border-gray-100 dark:border-gray-700 flex justify-between items-center flex-shrink-0">
        <div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
            {t('modals.CrewSelectionModal.crewSize')}
          </span>
          <span className="text-xl font-black text-gray-900 dark:text-white">{added.length}</span>
        </div>
        <div className="flex gap-3 items-center">
          <Button variant="secondary" onClick={onCancel}>
            {t('modals.CrewSelectionModal.cancel')}
          </Button>
          <Button onClick={onDone} className="shadow-lg shadow-primary-500/20">
            {t('modals.CrewSelectionModal.add')}
          </Button>
        </div>
      </div>
    </div>
  );
};
