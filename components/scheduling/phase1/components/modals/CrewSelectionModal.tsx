
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, User, Check, Crown, Calendar, AlertTriangle, X, Clock, Briefcase, Trash2, Plus } from 'lucide-react';
import { Modal, Button, SearchInput, TextInput } from '../UI';
import { CrewBreak, CrewMember, Job, JobCrewAllocation } from '../../types';
import { DatePicker } from '../ui/DatePicker';
import { CrewTransferPicker } from './CrewTransferPicker';
import { useTranslation } from '../../i18n/LanguageContext';
import { toLocalDateKey } from '../../services/scheduleEngine';
import { ShiftDayList } from './ShiftDayList';
import { normalizeAlloc } from '../../services/shifts';
import {
  AssignHoursModal,
  type AssignHoursDay,
  type AssignHoursModalJob,
  type DayWindow,
} from '../views/JobScheduling/AssignHoursModal';
import { detectAssignHoursWarnings, jobHoursProgress } from '../../services/assignHoursWarnings';
import { BreakEditorModal } from '../views/JobScheduling/BreakEditorModal';
import {
  resolveDayAvailability,
  formatAvailWindow,
  formatWindow,
  windowOutsideAvailability,
} from '../../services/crewAvailability';
import { dayCommitments } from '../../services/crewWeeklyHours';
import { resolveBreaks, unpaidBreakHours, setMemberDayBreaks } from '../../services/crewBreaks';
import {
  CapacityBar,
  computeShiftCapacity,
  computeWeeklyCapacity,
  computeDayShiftCapacity,
  computeDayAllCrewCapacity,
  computeDayLoad,
  seedHoursDraft,
} from '../../services/shiftCapacity';

// Fixed widths for the three pinned columns, so the header and body cells line up and
// each one knows where the previous column ends.
const COL_CREW = 186;
const COL_SHIFT = 130;
const COL_WEEKLY = 130;
const COL_DAY = 195;

/** One line of a cell's day breakdown. `tone` styles it: the shift being edited leads,
 *  other bookings are muted, an out-of-hours note is a warning. */
interface TipLine { text: string; tone: 'lead' | 'muted' | 'warn' }

const fmtHours = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

// Length of an 'HH:mm'–'HH:mm' window, in hours.
const windowLength = (w: { startTime: string; endTime: string }) => {
    const toH = (t: string) => { const [h, m] = t.split(':').map(Number); return h + (m || 0) / 60; };
    return Math.max(0, Math.round((toH(w.endTime) - toH(w.startTime)) * 10) / 10);
};

// "Aug 5 – Aug 6, 2026" for a range, "Aug 5, 2026" for a single day.
const formatRange = (days: Date[]) => {
    if (days.length === 0) return '';
    const first = days[0];
    const last = days[days.length - 1];
    const md = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (days.length === 1) return `${md(first)}, ${first.getFullYear()}`;
    return `${md(first)} – ${md(last)}, ${last.getFullYear()}`;
};

interface CrewSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  // This prop can now receive partial data if editing an existing allocation
  currentCrew: CrewMember[]; 
  onSave: (crew: CrewMember[], allocation?: Partial<JobCrewAllocation>) => void;
  allStaff?: CrewMember[];
  
  // Job Context
  jobStartDate?: string;
  jobEndDate?: string;
  existingJobs?: Job[];
  
  // Editing Context
  allocationToEdit?: JobCrewAllocation;

  // Stats
  workOrderNumber?: string;
  estHours?: number;
  assignedHours?: number;
  renderedHours?: number;

  // When true, show only crew member selection (search + roster). Dates, default
  // times, per-day hours, and the stats header are hidden because they live in
  // the reschedule sidebar.
  simplified?: boolean;
  // When true, omit the Work Order info card from the stats header (the rest of
  // the header — hours stats + job schedule — still shows). Used by Job
  // Scheduling, where the shift isn't tied to a single work order number.
  hideWorkOrder?: boolean;
  // Optional overrides for the modal title and confirm-button label. When unset they
  // fall back to the defaults derived from `simplified` / `allocationToEdit`.
  title?: string;
  confirmLabel?: string;
  // Job being assigned — excluded when summing each member's weekly commitments.
  excludeJobId?: string;
  // JS getDay() values that are non-working in the user's scheduling settings.
  // Drives each member's weekly capacity. Defaults to [0,6] (Sun/Sat).
  weekendDays?: number[];
  // Hours in a standard working day, from the user's scheduling settings
  // (`crewDailyCapacityHours`, else the configured work-day window). Drives every
  // per-person figure — the weekly meter, the crew picker, and each cell's hours
  // left — so they read the same as the Job Scheduling crew hours grid. Defaults
  // to 8 for callers that don't know the setting.
  dailyCapacityHours?: number;
  // The company's default working window, used when a member has no window of their own
  // for a day. Drives the "outside their working hours" flag on each cell.
  availabilityWindow?: { startTime: string; endTime: string };
  // The job this shift belongs to, named the way the crew view names it. The Assign
  // Hours popup opened from a member shows it as its (locked) job.
  jobRef?: { jobNumber: string; name: string };
  // Hours the job's OTHER shifts already hold. That popup's JOB HOURS readout adds the
  // draft's own hours on top, so it counts the whole job like the crew view's does.
  otherShiftsHours?: number;
  // Persist an edit to a crew member's own record — used by the break editor the popup
  // opens. Omit to hide the break controls.
  onEditMember?: (member: CrewMember) => void;
  // Company-default breaks. Unpaid ones are already carved out of `dailyCapacityHours`
  // upstream; the cell names them so the gap between a member's window and their
  // capacity is legible instead of looking like an off-by-one.
  defaultBreaks?: CrewBreak[];
}

// Helper to ensure YYYY-MM-DD format
const formatDateForInput = (dateStr?: string) => {
    if (!dateStr) return toLocalDateKey(new Date());
    return dateStr.split('T')[0];
};

// Parse a date (or datetime) string at local noon. Bare 'YYYY-MM-DD' strings parse as
// UTC midnight, which lands on the previous day in negative-offset timezones — that
// shift used to desync the grid's columns from the seeded hoursAssignments keys.
const parseLocalDate = (dateStr: string) => new Date(`${dateStr.split('T')[0]}T12:00:00`);

export const CrewSelectionModal = ({ 
  isOpen, 
  onClose, 
  currentCrew,
  onSave,
  allStaff = [],
  jobStartDate,
  jobEndDate,
  existingJobs = [],
  allocationToEdit,
  workOrderNumber,
  estHours,
  assignedHours,
  renderedHours,
  simplified = false,
  hideWorkOrder = false,
  title,
  confirmLabel,
  excludeJobId,
  weekendDays = [0, 6],
  dailyCapacityHours = 8,
  availabilityWindow = { startTime: '08:00', endTime: '17:00' },
  defaultBreaks = [],
  jobRef,
  otherShiftsHours = 0,
  onEditMember,
}: CrewSelectionModalProps) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Full-modal takeover: the two-panel crew transfer picker. Its Add/Remove buttons write
  // straight through to the draft, so Cancel needs the selection as it stood when the panel
  // opened — hence the snapshot rather than a second copy of the roster state.
  const [showPicker, setShowPicker] = useState(false);
  const [pickerUndo, setPickerUndo] = useState<{ ids: string[]; leaderId: string | null } | null>(null);
  
  // Allocation Details
  const [allocName, setAllocName] = useState('Crew Shift');
  const [allocStartDate, setAllocStartDate] = useState(formatDateForInput(jobStartDate));
  const [allocEndDate, setAllocEndDate] = useState(formatDateForInput(jobEndDate));
  // A shift with no times of its own starts from the company work window (settings),
  // not a hardcoded 8–5.
  const [defaultStartTime, setDefaultStartTime] = useState(availabilityWindow.startTime);
  const [defaultEndTime, setDefaultEndTime] = useState(availabilityWindow.endTime);

  // Which days of the range the shift skips, and any per-day window overrides. Both are
  // keyed by local 'YYYY-MM-DD' and are seeded from the shift being edited.
  const [skipDays, setSkipDays] = useState<string[]>([]);
  const [dayHours, setDayHours] = useState<Record<string, { startTime: string; endTime: string }>>({});

  // Member Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [leaderId, setLeaderId] = useState<string | null>(null);

  // The day breakdown shown while a cell is hovered. It is rendered through a portal at
  // fixed coordinates rather than inside the cell: the grid sits in an overflow-hidden,
  // horizontally scrolling container, which clips any absolutely positioned child.
  const [dayTip, setDayTip] = useState<{ x: number; y: number; above: boolean; lines: TipLine[] } | null>(null);

  // Granular Data: { memberId: { dateStr: hours } }
  const [hoursAssignments, setHoursAssignments] = useState<Record<string, Record<string, number>>>({});

  // The member whose Assign Hours popup is open — the same popup the crew view's hours
  // grid opens from a member's name. Its edits land in this modal's draft; nothing reaches
  // the schedule until the shift itself is saved.
  const [hoursMemberId, setHoursMemberId] = useState<string | null>(null);
  // The day list handed to that popup, snapshotted when it opens. The popup reloads its
  // inputs whenever the getter's identity changes, so a list rebuilt every render would
  // wipe hours mid-typing.
  const [hoursDays, setHoursDays] = useState<AssignHoursDay[]>([]);
  // Per-member per-day working windows, { memberId: { dateKey: window } }. Only the popup
  // authors these; the day rows above the grid set the shift-wide window.
  const [memberWindows, setMemberWindows] = useState<Record<string, Record<string, DayWindow>>>({});
  // The member-day whose breaks are being edited, opened from a day row in that popup.
  // Breaks belong to the person, not the shift, so this one saves straight through.
  const [breakEdit, setBreakEdit] = useState<{ memberId: string; dateKey: string } | null>(null);

  const STANDARD_WORK_DAY_HOURS = dailyCapacityHours;

  // The Sun–Sat week containing the job, used for per-member weekly hour totals.
  const weekDays = useMemo(() => {
    const base = jobStartDate ? parseLocalDate(jobStartDate) : new Date();
    const start = new Date(base);
    start.setDate(base.getDate() - base.getDay());
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [jobStartDate]);

  useEffect(() => {
    if (isOpen) {
      if (allocationToEdit) {
          setAllocName(allocationToEdit.name);
          setAllocStartDate(formatDateForInput(allocationToEdit.startDate));
          setAllocEndDate(formatDateForInput(allocationToEdit.endDate));
          setDefaultStartTime(allocationToEdit.startTime || availabilityWindow.startTime);
          setDefaultEndTime(allocationToEdit.endTime || availabilityWindow.endTime);
          setSkipDays(allocationToEdit.skipDays ?? []);
          // Shifts saved before the default was editable materialized EVERY day into
          // dailyHours. Keeping those would badge all of them "Custom" and strand the
          // default control, so entries matching the default are dropped on load.
          {
            const dStart = allocationToEdit.startTime || availabilityWindow.startTime;
            const dEnd = allocationToEdit.endTime || availabilityWindow.endTime;
            setDayHours(Object.fromEntries(
              Object.entries(allocationToEdit.dailyHours ?? {})
                .filter(([, w]) => w.startTime !== dStart || w.endTime !== dEnd),
            ));
          }
          setSelectedIds(allocationToEdit.memberIds);
          setLeaderId(allocationToEdit.memberIds[0] || null);
          
          // Read every member's hours the way the board reads them. A raw
          // hoursAssignments map is authoritative only per MEMBER: anyone on memberIds
          // without an entry is booked implicitly for the shift window, and seeding from
          // the map directly showed them blank — then saved that blank over their hours.
          setHoursAssignments(seedHoursDraft(allocationToEdit));
          setMemberWindows(allocationToEdit.memberDailyWindows ?? {});
      } else {
          // Defaults for New
          setAllocName('General Crew');
          setAllocStartDate(formatDateForInput(jobStartDate));
          setAllocEndDate(formatDateForInput(jobEndDate));
          setDefaultStartTime(availabilityWindow.startTime);
          setDefaultEndTime(availabilityWindow.endTime);
          setSkipDays([]);
          setDayHours({});

          const initialIds = currentCrew.map(c => c.id);
          setSelectedIds(initialIds);

          const leader = currentCrew.find(c => c.role === 'Leader');
          setLeaderId(leader ? leader.id : (currentCrew.length > 0 ? currentCrew[0].id : null));

          if (initialIds.length > 0) {
             initializeAssignmentsFromSimpleData(initialIds, jobStartDate || '', jobEndDate || jobStartDate || '', availabilityWindow.startTime, availabilityWindow.endTime);
          } else {
             setHoursAssignments({});
          }
          setMemberWindows({});
      }
      setSearchTerm('');
      setHoursMemberId(null);
      setBreakEdit(null);
      setShowPicker(false);
      setPickerUndo(null);
      setDayTip(null);
    }
  // Re-seed the modal's internal draft only when it opens, targets a different
  // allocation, or the job dates change — NOT on every parent render. `currentCrew`
  // and `allocationToEdit` are fresh references each render; depending on them would
  // re-run this effect mid-edit and wipe in-progress changes (e.g. a typed time).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, allocationToEdit?.id, jobStartDate, jobEndDate]);

  // Helpers to get date array
  const dateRange = useMemo(() => {
      const dates = [];
      const start = parseLocalDate(allocStartDate);
      const end = parseLocalDate(allocEndDate);

      // Safety break to prevent infinite loop if dates invalid
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
          return [];
      }

      const curr = new Date(start);
      // Limit to 60 days max for UI performance
      let safeCount = 0;
      while (curr <= end && safeCount < 60) {
          dates.push(new Date(curr));
          curr.setDate(curr.getDate() + 1);
          safeCount++;
      }
      return dates;
  }, [allocStartDate, allocEndDate]);

  // Calculate default hours per day based on shift times
  const defaultDailyHours = useMemo(() => {
      if (!defaultStartTime || !defaultEndTime) return 8;
      const [h1, m1] = defaultStartTime.split(':').map(Number);
      const [h2, m2] = defaultEndTime.split(':').map(Number);
      const diff = (h2 + m2/60) - (h1 + m1/60);
      return Math.max(0, parseFloat(diff.toFixed(1)));
  }, [defaultStartTime, defaultEndTime]);

  // A member's working window for one day: their own override first, then the shift's
  // day window, then the shift default — the order the board reads them in.
  const windowFor = (memberId: string, dateKey: string): DayWindow =>
      memberWindows[memberId]?.[dateKey]
      ?? dayHours[dateKey]
      ?? { startTime: defaultStartTime, endTime: defaultEndTime };

  const initializeAssignmentsFromSimpleData = (ids: string[], start: string, end: string, sTime: string, eTime: string) => {
      // Calculate derived hours
      const [h1, m1] = (sTime || availabilityWindow.startTime).split(':').map(Number);
      const [h2, m2] = (eTime || availabilityWindow.endTime).split(':').map(Number);
      const hrs = Math.max(0, parseFloat(((h2 + m2/60) - (h1 + m1/60)).toFixed(1)));

      const map: Record<string, Record<string, number>> = {};
      
      const sDate = parseLocalDate(start);
      const eDate = parseLocalDate(end);
      
      ids.forEach(mid => {
          map[mid] = {};
          // Only init if dates valid
          if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
              const curr = new Date(sDate);
              let safety = 0;
              while (curr <= eDate && safety < 60) {
                  const day = curr.getDay();
                  // Skip weekends by default for initialization
                  if (day !== 0 && day !== 6) {
                      const dStr = toLocalDateKey(curr);
                      map[mid][dStr] = hrs;
                  }
                  curr.setDate(curr.getDate() + 1);
                  safety++;
              }
          }
      });
      setHoursAssignments(prev => ({...prev, ...map})); // Merge just in case
  };

  const handleCellChange = (memberId: string, dateStr: string, value: string) => {
      const numVal = parseFloat(value);
      const newAssignments = { ...hoursAssignments };
      if (!newAssignments[memberId]) newAssignments[memberId] = {};

      if (isNaN(numVal) || value === '') {
          delete newAssignments[memberId][dateStr];
      } else {
          newAssignments[memberId][dateStr] = numVal;
      }
      setHoursAssignments(newAssignments);
  };

  const openPicker = () => {
      setPickerUndo({ ids: selectedIds, leaderId });
      setShowPicker(true);
  };

  const closePickerDiscarding = () => {
      if (pickerUndo) {
          setSelectedIds(pickerUndo.ids);
          setLeaderId(pickerUndo.leaderId);
      }
      setPickerUndo(null);
      setShowPicker(false);
      setSearchTerm('');
  };

  const addMember = (id: string) => {
      if (!selectedIds.includes(id)) {
          setSelectedIds([...selectedIds, id]);
          if (!leaderId) setLeaderId(id);
          // Auto-init logic could go here too if desired
      }
  };

  const removeMember = (id: string) => {
      setSelectedIds(prev => prev.filter(mid => mid !== id));
      if (leaderId === id) setLeaderId(null);
      // Clean up assignments? Optional. Keeping them doesn't hurt if re-added.
  };

  const handleSave = () => {
      if (noWorkedDays) return;
      // The shift's start/end IS the default window — the editor shows it, so a day may
      // safely fall back to it. Only days that genuinely read differently are persisted as
      // overrides; materializing every day would make each one reopen as "Custom" and leave
      // the default control looking inert. `recomputeJobEnvelope` reads the boundary day
      // through `allocDayWindow`, which takes the override when there is one and the default
      // otherwise, so the job envelope is right either way.
      const savedDayHours = Object.fromEntries(
        workedDayKeys
          .filter(k => dayHours[k] && (dayHours[k].startTime !== defaultStartTime || dayHours[k].endTime !== defaultEndTime))
          .map(k => [k, dayHours[k]]),
      );
      // Unscheduled: persist only the member selection — no dates/hours yet, so we
      // don't create a misleading allocation pinned to today.
      const allocationData: Partial<JobCrewAllocation> = isUnscheduled
        ? { id: allocationToEdit?.id, name: allocName, memberIds: selectedIds }
        : {
            id: allocationToEdit?.id,
            name: allocName,
            startDate: allocStartDate,
            endDate: allocEndDate,
            startTime: defaultStartTime,
            endTime: defaultEndTime,
            memberIds: selectedIds,
            hoursAssignments: hoursAssignments,
            skipDays,
            dailyHours: Object.keys(savedDayHours).length ? savedDayHours : undefined,
            // Authored in the Assign Hours popup opened from a member's name, and seeded
            // from the shift, so saving neither drops existing overrides nor loses new ones.
            memberDailyWindows: Object.keys(memberWindows).length ? memberWindows : undefined,
        };

      const staffList = allStaff.length > 0 ? allStaff : currentCrew;
      const newCrew = selectedIds.map(id => {
          const member = staffList.find(s => s.id === id);
          if (!member) return null;
          return { ...member, role: id === leaderId ? 'Leader' : 'Painter' };
      }).filter(Boolean) as CrewMember[];

      // The draft keeps removed boundary days as skips so they stay restorable while
      // editing. What persists is still the trimmed shape: a shift's range IS its first
      // and last worked day, which is what the board and envelope logic assume.
      onSave(newCrew, isUnscheduled ? allocationData : normalizeAlloc(allocationData as JobCrewAllocation));
      onClose();
  };

  // Summaries
  const totalHours = useMemo(() => {
      let sum = 0;
      selectedIds.forEach(mid => {
          const map = hoursAssignments[mid];
          if (map) {
              Object.values(map).forEach((h: number) => sum += h);
          }
      });
      return sum;
  }, [selectedIds, hoursAssignments]);

  const selectedMembers = selectedIds.map(id => (allStaff.length > 0 ? allStaff : currentCrew).find(s => s.id === id)).filter(Boolean) as CrewMember[];

  // --- Capacity roll-ups shown in the grid ---
  // Not memoized: they depend on `existingJobs` and member schedules as well as the draft
  // hours, and the whole grid re-renders on every keystroke anyway.
  // Column alignment uses the FULL range (a skipped day keeps its greyed column so the
  // scheduler can switch it back on); capacity roll-ups use worked days only.
  const dayKeys = dateRange.map(toLocalDateKey);
  const workedDayKeys = dayKeys.filter(k => !skipDays.includes(k));
  // Removed days now occupy rows, so the badge has to say how many are actually worked —
  // otherwise "3 days" beside six rows reads as a miscount.
  const dayCountLabel = dayKeys.length > workedDayKeys.length
      ? t('modals.CrewSelectionModal.daysWorkedOfTotal', { count: workedDayKeys.length, total: dayKeys.length })
      : workedDayKeys.length === 1
          ? t('modals.CrewSelectionModal.dayLower')
          : t('modals.CrewSelectionModal.daysLower', { count: workedDayKeys.length });
  const roster = allStaff.length > 0 ? allStaff : currentCrew;
  const capacityOpts = {
      standardDay: STANDARD_WORK_DAY_HOURS,
      weekendDays,
      excludeJobId,
      excludeAllocationId: allocationToEdit?.id,
      // So a member's own half day is read net of the breaks inside it, matching the grid.
      defaultBreaks,
  };

  // Per member: this shift, and their whole week.
  const shiftBars: Record<string, CapacityBar> = {};
  const weeklyBars: Record<string, CapacityBar> = {};
  selectedMembers.forEach(m => {
      shiftBars[m.id] = computeShiftCapacity(m, workedDayKeys, hoursAssignments, defaultDailyHours);
      weeklyBars[m.id] = computeWeeklyCapacity(m, weekDays, existingJobs, hoursAssignments, capacityOpts);
  });

  // Per day column: this shift's load, and the whole roster's load.
  const dayBars = dayKeys.map(key => ({
      shift: computeDayShiftCapacity(selectedMembers, key, hoursAssignments, defaultDailyHours),
      allCrew: computeDayAllCrewCapacity(roster, selectedMembers, key, existingJobs, hoursAssignments, defaultDailyHours, capacityOpts),
  }));

  // --- Assign Hours popup, opened from a member's name ---
  const hoursMember = selectedMembers.find(m => m.id === hoursMemberId) ?? null;

  // A single locked "job": the shift being edited. There is nothing else to assign to
  // from in here, so the popup's job picker has one fixed entry.
  const hoursJobs: AssignHoursModalJob[] = useMemo(() => [{
      id: excludeJobId ?? 'this-shift',
      jobNumber: jobRef?.jobNumber ?? (hideWorkOrder ? '' : (workOrderNumber ?? '')),
      name: jobRef?.name ?? allocName ?? t('modals.CrewSelectionModal.thisShift'),
  }], [excludeJobId, jobRef?.jobNumber, jobRef?.name, hideWorkOrder, workOrderNumber, allocName, t]);

  // Snapshot the member's worked days as the popup opens: the shift's own range minus
  // skipped days, prefilled from the draft.
  const openHoursFor = (member: CrewMember) => {
      setHoursDays(dayKeys
          .filter(k => !skipDays.includes(k))
          .map(k => {
              const d = parseLocalDate(k);
              const win = windowFor(member.id, k);
              const avail = resolveDayAvailability(member, k, availabilityWindow);
              return {
                  dateKey: k,
                  weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
                  dayNum: d.toLocaleDateString(undefined, { day: 'numeric' }),
                  hours: hoursAssignments[member.id]?.[k] ?? 0,
                  startTime: win.startTime,
                  endTime: win.endTime,
                  breaks: resolveBreaks(member.schedule?.[k], defaultBreaks),
                  off: avail.off,
                  offReason: avail.reason,
              };
          }));
      setHoursMemberId(member.id);
  };

  const getHoursDays = useCallback(() => hoursDays, [hoursDays]);

  // The hours being entered, measured against the two limits the crew view checks: the
  // member's week and the job's estimate. Both read the draft, so the advisories agree
  // with the meters behind the popup.
  const hoursContext = (hoursByDay: Record<string, number>) => {
      if (!hoursMember) return null;
      const round1 = (n: number) => Math.round(n * 10) / 10;
      const enteredTotal = Object.values(hoursByDay).reduce((sum, h) => sum + (h || 0), 0);
      // What the shown days already hold for this member — the entered hours replace it.
      const shownExisting = hoursDays.reduce((sum, d) => sum + (hoursAssignments[hoursMember.id]?.[d.dateKey] ?? 0), 0);
      const week = weeklyBars[hoursMember.id];
      return {
          memberName: hoursMember.name,
          enteredTotal: round1(enteredTotal),
          memberWeekTotalOther: Math.max(0, round1((week?.assigned ?? 0) - shownExisting)),
          weeklyCapacity: week?.capacity ?? 0,
          jobName: jobRef?.name ?? allocName ?? t('modals.CrewSelectionModal.thisShift'),
          // The whole job: its other shifts, plus this draft less the days being replaced.
          jobTotalOther: Math.max(0, round1(otherShiftsHours + totalHours - shownExisting)),
          estHours: estHours ?? 0,
      };
  };

  // A break edit saves to the member's own record. The popup's day rows are a snapshot,
  // so re-read the edited day from the member we just wrote — the `allStaff` prop is still
  // a render behind.
  const handleBreaksSave = (member: CrewMember, dateKey: string, breaks?: CrewBreak[]) => {
      const updated = setMemberDayBreaks(member, dateKey, breaks);
      onEditMember?.(updated);
      setHoursDays(days => days.map(d => d.dateKey === dateKey
          ? { ...d, breaks: resolveBreaks(updated.schedule?.[dateKey], defaultBreaks) }
          : d));
      setBreakEdit(null);
  };

  // Straight into the draft: each shown day's hours (0 clears the day), plus any window
  // the user retimed, kept as that member's own override for the day.
  const handleHoursSubmit = (_jobId: string, hoursByDay: Record<string, number>, windowsByDay: Record<string, DayWindow>) => {
      const mid = hoursMemberId;
      if (!mid) return;
      setHoursAssignments(prev => {
          const next = { ...(prev[mid] ?? {}) };
          Object.entries(hoursByDay).forEach(([k, h]) => {
              if (h > 0) next[k] = h; else delete next[k];
          });
          return { ...prev, [mid]: next };
      });
      if (Object.keys(windowsByDay).length) {
          setMemberWindows(prev => ({ ...prev, [mid]: { ...(prev[mid] ?? {}), ...windowsByDay } }));
      }
      setHoursMemberId(null);
  };

  // "10 / 18h" + a fill bar, turning orange once assigned passes capacity. `remaining`
  // adds the "8h left" figure — reserved for the meters measured against the PERSON, so
  // that one phrase keeps one meaning across the screen.
  const renderMeter = (bar: CapacityBar, tooltip: string, remaining = true) => (
      <div title={tooltip} className="cursor-help">
          <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-[13px] font-bold tabular-nums text-gray-900 dark:text-white whitespace-nowrap">
                  {fmtHours(bar.assigned)}
                  <span className="font-semibold text-gray-400">{`/${fmtHours(bar.capacity)}h`}</span>
              </span>
              {(bar.over > 0 || remaining) && (
                  <span className={`text-[9px] font-bold whitespace-nowrap ${bar.over > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-500'}`}>
                      {bar.over > 0
                          ? t('modals.CrewSelectionModal.hoursOver', { hours: fmtHours(bar.over) })
                          : t('modals.CrewSelectionModal.hoursFree', { hours: fmtHours(bar.free) })}
                  </span>
              )}
          </div>
          <div className="h-1 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                  className={`h-full rounded-full transition-all ${bar.over > 0 ? 'bg-orange-500' : 'bg-green-500'}`}
                  style={{ width: `${bar.ratio * 100}%` }}
              />
          </div>
      </div>
  );

  // Compact "Shift 9/18h" chip under a day heading.
  const renderDayChip = (label: string, bar: CapacityBar, tooltip: string) => (
      <span
          title={tooltip}
          className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-[9px] font-bold whitespace-nowrap cursor-help"
      >
          <span className="text-gray-400 font-semibold">{label} </span>
          <span className={`tabular-nums ${bar.over > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-300'}`}>
              {`${fmtHours(bar.assigned)}/${fmtHours(bar.capacity)}h`}
          </span>
      </span>
  );

  // The job has no dates yet (and we're not editing an existing dated allocation): per-day
  // hours can't be assigned, so hide the grid and let the user just pick crew. Only applies
  // to the simplified modal — the full modal has its own date pickers, so it always shows
  // the crew + hours grid (dates default to today and can be edited inline).
  const isUnscheduled = simplified && !jobStartDate && !allocationToEdit?.startDate;

  // Every day switched off: there is nothing to schedule, so block Apply rather than
  // saving a shift that works no days. `handleSave` closes over this — the reference is
  // evaluated on click, after this line has run.
  const noWorkedDays = !isUnscheduled && dateRange.length > 0 && workedDayKeys.length === 0;

  /** Remove a day from the shift. This ONLY records a skip — it never moves the date
   *  pickers, even for a boundary day. Trimming the range on the way in was lossy: the
   *  skip was dropped along with it, so an accidental removal could only be undone by
   *  re-picking the dates, which readmitted every other removed day too. The range is now
   *  the envelope the user set; the day list says which of those days are worked. The save
   *  path still normalizes, so what gets persisted is unchanged. */
  const deleteDay = (key: string) => {
      setSkipDays(prev => (prev.includes(key) ? prev : [...prev, key]));
  };

  /** Put a removed day back. Its window and per-member hours were never purged, so the
   *  day returns exactly as it was. */
  const restoreDay = (key: string) => {
      setSkipDays(prev => prev.filter(k => k !== key));
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title ?? (simplified ? t('modals.CrewSelectionModal.assignCrew') : ((allocationToEdit && !hideWorkOrder) ? t('modals.CrewSelectionModal.editCrewAssignment') : t('modals.CrewSelectionModal.assignCrewAndSchedule')))} maxWidth={simplified ? "max-w-5xl" : "max-w-6xl"}>
      {/* The Modal shell already scrolls its body, so this column must not scroll too —
          a second overflow here stacks a redundant scrollbar beside the shell's. */}
      <div className="flex flex-col min-h-[60vh]">
        {showPicker ? (
          <CrewTransferPicker
            allStaff={allStaff.length > 0 ? allStaff : currentCrew}
            selectedIds={selectedIds}
            leaderId={leaderId}
            weekDays={weekDays}
            existingJobs={existingJobs}
            excludeJobId={excludeJobId}
            excludeAllocationId={allocationToEdit?.id}
            hoursAssignments={hoursAssignments}
            weekendDays={weekendDays}
            standardDay={STANDARD_WORK_DAY_HOURS}
            onAdd={addMember}
            onRemove={removeMember}
            onSetLeader={setLeaderId}
            onDone={() => { setShowPicker(false); setSearchTerm(''); setPickerUndo(null); }}
            onCancel={closePickerDiscarding}
          />
        ) : (
        <>

        {/* --- STATS HEADER: estimate vs assigned vs logged, and the shift's dates --- */}
        {!simplified && (
        <div
            className="mb-6 flex-shrink-0 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 grid divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-800 overflow-hidden"
            style={{ gridTemplateColumns: `repeat(${hideWorkOrder ? 4 : 5}, minmax(0, 1fr))` }}
        >
            {!hideWorkOrder && (
            <div className="p-4">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{t('modals.CrewSelectionModal.workOrder')}</span>
                <span className="text-lg font-black text-gray-900 dark:text-white font-mono">#{workOrderNumber || '---'}</span>
            </div>
            )}
            <div className="p-4">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{t('modals.CrewSelectionModal.estimatedHours')}</span>
                <span className="text-lg font-black text-gray-900 dark:text-white tabular-nums">{estHours?.toFixed(1) || '0.0'}</span>
            </div>
            <div className="p-4">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{t('modals.CrewSelectionModal.assigned')}</span>
                {/* Job-wide when the caller tracks it; otherwise the draft in this grid. */}
                <span className="text-lg font-black text-blue-600 dark:text-blue-400 tabular-nums">{(assignedHours ?? totalHours).toFixed(1)}</span>
            </div>
            <div className="p-4">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{t('modals.CrewSelectionModal.logged')}</span>
                <span className="text-lg font-black text-green-600 dark:text-green-400 tabular-nums">{renderedHours?.toFixed(1) || '0.0'}</span>
            </div>
            <div className="p-4 bg-gray-50/60 dark:bg-gray-800/40">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{t('modals.CrewSelectionModal.scheduledFor')}</span>
                <div className="text-sm font-bold text-gray-900 dark:text-white">
                    {dateRange.length > 0 ? formatRange(dateRange) : t('modals.CrewSelectionModal.tbd')}
                </div>
                {dateRange.length > 0 && (
                    <span className="text-[11px] font-medium text-gray-400">{dayCountLabel}</span>
                )}
            </div>
        </div>
        )}

        {/* --- TOP: SETTINGS --- */}
        {/* Name and both dates on one line, then the day table beneath. The table is the
            element that needs the modal's width, so nothing above it competes for room. */}
        {!simplified && (
        <div className="mb-6 flex-shrink-0 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-1 min-w-0">
                    <TextInput label={t('modals.CrewSelectionModal.shiftName')} value={allocName} onChange={setAllocName} placeholder={t('modals.CrewSelectionModal.shiftNamePlaceholder')} />
                </div>
                <div className="w-full sm:w-44 shrink-0">
                    <DatePicker label={t('modals.CrewSelectionModal.startDate')} value={allocStartDate} onChange={setAllocStartDate} />
                </div>
                <div className="w-full sm:w-44 shrink-0">
                    <DatePicker label={t('modals.CrewSelectionModal.endDate')} value={allocEndDate} align="right" onChange={setAllocEndDate} />
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-[11px] font-bold text-blue-600 dark:text-blue-400 sm:mb-2.5">
                    {dayCountLabel}
                </span>
            </div>

            <ShiftDayList
                dayKeys={dayKeys}
                skipDays={skipDays}
                dayHours={dayHours}
                defaultStart={defaultStartTime}
                defaultEnd={defaultEndTime}
                weekendDays={weekendDays}
                onDeleteDay={deleteDay}
                onRestoreDay={restoreDay}
                onChangeDayWindow={(key, w) => setDayHours(prev => ({ ...prev, [key]: w }))}
                onChangeDefaultWindow={w => { setDefaultStartTime(w.startTime); setDefaultEndTime(w.endTime); }}
                onClearOverrides={() => setDayHours({})}
                onResetDay={key => setDayHours(prev => { const { [key]: _gone, ...rest } = prev; return rest; })}
                onSkipAll={setSkipDays}
            />
        </div>
        )}

        {/* --- MIDDLE: ADD MEMBER BAR (opens the transfer picker) --- */}
        <div className="relative mb-4 flex-shrink-0">
            <div onClick={openPicker}>
                <SearchInput
                    value={searchTerm}
                    onChange={openPicker}
                    placeholder={t('modals.CrewSelectionModal.searchPlaceholder')}
                    className="w-full"
                />
            </div>
        </div>

        {/* --- UNSCHEDULED: pick crew only; daily hours come after scheduling --- */}
        {isUnscheduled ? (
        <div className="flex-1 min-h-[200px] overflow-hidden border border-dashed border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center bg-gray-50/60 dark:bg-gray-900/30 p-8 text-center">
            <div className="max-w-sm">
                <Clock className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{t('modals.CrewSelectionModal.scheduleJobPrompt')}</p>
                <p className="text-xs text-gray-400 mt-1">{t('modals.CrewSelectionModal.scheduleJobHelper')}</p>
            </div>
        </div>
        ) : (
        /* --- GRID: SCHEDULING --- */
        <div className="flex-1 min-h-[440px] overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col bg-white dark:bg-gray-800 relative">
            <div className="overflow-x-auto custom-scrollbar flex-1">
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            {/* Three pinned columns: who, their shift load, their week. */}
                            <th
                                className="sticky z-40 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-3 text-left align-bottom"
                                style={{ left: 0, width: COL_CREW, minWidth: COL_CREW }}
                            >
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('modals.CrewSelectionModal.crewMember')}</span>
                            </th>
                            <th
                                className="sticky z-40 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-3 text-left align-bottom"
                                style={{ left: COL_CREW, width: COL_SHIFT, minWidth: COL_SHIFT }}
                            >
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">{t('modals.CrewSelectionModal.shiftCapacity')}</span>
                            </th>
                            <th
                                className="sticky z-40 bg-gray-50 dark:bg-gray-900 border-b border-r border-gray-200 dark:border-gray-700 p-3 text-left align-bottom shadow-[2px_0_5px_rgba(0,0,0,0.05)]"
                                style={{ left: COL_CREW + COL_SHIFT, width: COL_WEEKLY, minWidth: COL_WEEKLY }}
                            >
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">{t('modals.CrewSelectionModal.weeklyCapacity')}</span>
                            </th>
                            {dateRange.map((d, dayIdx) => {
                                const isWeekend = weekendDays.includes(d.getDay());
                                const isSkipped = skipDays.includes(toLocalDateKey(d));
                                const bars = dayBars[dayIdx];
                                return (
                                    <th key={d.toISOString()} className={`p-2 border-b border-l border-gray-200 dark:border-gray-700 text-center align-bottom ${isSkipped ? 'bg-gray-100 dark:bg-gray-800 opacity-60' : isWeekend ? 'bg-gray-100/50 dark:bg-gray-800/50' : 'bg-white dark:bg-gray-900'}`} style={{ width: COL_DAY, minWidth: COL_DAY }}>
                                        <div className="flex flex-col items-center gap-1.5">
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase">{d.toLocaleDateString(undefined, {weekday:'short'})}</span>
                                                <span className="text-sm font-bold text-gray-900 dark:text-white">{d.toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                                            </div>
                                            {selectedMembers.length > 0 && !isSkipped && (
                                                <div className="flex items-center gap-1">
                                                    {renderDayChip(t('modals.CrewSelectionModal.chipShift'), bars.shift, t('modals.CrewSelectionModal.chipShiftTooltip'))}
                                                    {renderDayChip(t('modals.CrewSelectionModal.chipAllCrew'), bars.allCrew, t('modals.CrewSelectionModal.chipAllCrewTooltip'))}
                                                </div>
                                            )}
                                        </div>
                                    </th>
                                )
                            })}
                            <th className="w-full border-b border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
                        </tr>
                    </thead>
                    <tbody>
                        {selectedMembers.map(member => {
                            const firstName = member.name.split(' ')[0];
                            return (
                            <tr key={member.id} className="group hover:bg-gray-50 dark:hover:bg-gray-800">
                                {/* Who */}
                                <td
                                    className="sticky z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-3 py-2.5 group-hover:bg-gray-50 dark:group-hover:bg-gray-800 transition-colors"
                                    style={{ left: 0, width: COL_CREW, minWidth: COL_CREW }}
                                >
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => removeMember(member.id)}
                                            aria-label={t('modals.CrewSelectionModal.remove')}
                                            className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                        {/* Same affordance as the crew view's hours grid: the name opens that
                                            member's Assign Hours popup, here writing into the shift draft. */}
                                        <button
                                            type="button"
                                            onClick={() => openHoursFor(member)}
                                            aria-label={t('views.JobScheduling.CrewHoursGrid.assignHoursTo', { name: member.name })}
                                            title={t('views.JobScheduling.CrewHoursGrid.assignHoursTo', { name: member.name })}
                                            className="group/member flex min-w-0 flex-1 items-center gap-2 rounded-lg -mx-1 px-1 py-1 text-left hover:bg-gray-100 dark:hover:bg-gray-700/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 transition-colors"
                                        >
                                            <img src={member.photo} className="w-8 h-8 rounded-full bg-gray-100 object-cover flex-shrink-0" alt="" />
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-bold text-gray-900 dark:text-white leading-none mb-0.5 truncate group-hover/member:text-primary-600 dark:group-hover/member:text-primary-400 transition-colors">{firstName}</span>
                                                <span className="text-[10px] text-gray-400 font-medium truncate">{member.role}</span>
                                            </div>
                                        </button>
                                    </div>
                                </td>

                                {/* Their load on this shift */}
                                <td
                                    className="sticky z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-3 py-2.5 group-hover:bg-gray-50 dark:group-hover:bg-gray-800 transition-colors"
                                    style={{ left: COL_CREW, width: COL_SHIFT, minWidth: COL_SHIFT }}
                                >
                                    {renderMeter(shiftBars[member.id], t('modals.CrewSelectionModal.shiftCapacityTooltip', { name: firstName }), false)}
                                </td>

                                {/* Their week, everything included */}
                                <td
                                    className="sticky z-30 bg-white dark:bg-gray-900 border-b border-r border-gray-200 dark:border-gray-700 px-3 py-2.5 shadow-[2px_0_5px_rgba(0,0,0,0.05)] group-hover:bg-gray-50 dark:group-hover:bg-gray-800 transition-colors"
                                    style={{ left: COL_CREW + COL_SHIFT, width: COL_WEEKLY, minWidth: COL_WEEKLY }}
                                >
                                    {renderMeter(weeklyBars[member.id], t('modals.CrewSelectionModal.weeklyCapacityTooltip', { name: firstName }))}
                                </td>

                                {/* One cell per shift day */}
                                {dateRange.map(d => {
                                    const dStr = toLocalDateKey(d);
                                    const isSkipped = skipDays.includes(dStr);
                                    const assigned = hoursAssignments[member.id]?.[dStr] ?? '';
                                    const numAssigned = Number(assigned) || 0;
                                    const isWeekend = weekendDays.includes(d.getDay());
                                    // Their availability for this day: their own window when they have
                                    // one, else the company default.
                                    const avail = resolveDayAvailability(member, dStr, availabilityWindow);
                                    const off = avail.off;
                                    // This day's OWN shift window. A single scalar was wrong once days
                                    // could carry their own start/end times.
                                    const shiftWin = windowFor(member.id, dStr);
                                    // The caption reads the member's DAY: their working day less other
                                    // jobs and this cell, so it reconciles with the weekly meter and the
                                    // crew picker. Hours past the shift window are a separate flag —
                                    // the window measures the shift, not the person.
                                    const shiftWindow = off ? 0 : windowLength(shiftWin);
                                    const overWindow = Math.max(0, Math.round((numAssigned - shiftWindow) * 10) / 10);
                                    // WHEN, not how much: 4h is still the wrong 4h at 6pm for someone
                                    // who works 8–5, and volume alone can never catch that.
                                    const fit = isSkipped
                                        ? { before: 0, after: 0, outside: false }
                                        : windowOutsideAvailability(avail, shiftWin);
                                    const load = computeDayLoad(member, dStr, existingJobs, numAssigned, capacityOpts);
                                    // Unpaid break time on this member-day. It is already out of `capacity`
                                    // upstream; naming it keeps "8am–5pm" and "8.5h" from reading as a
                                    // contradiction on the same line.
                                    const breaks = resolveBreaks(member.schedule?.[dStr], defaultBreaks);
                                    const unpaidBreak = unpaidBreakHours(breaks);
                                    const unpaidLabel = breaks.filter(b => !b.paid).map(b => b.label).find(Boolean)
                                        ?? t('modals.CrewSelectionModal.breakLabel');
                                    const elsewhere = isSkipped ? [] : dayCommitments(member, existingJobs, dStr, capacityOpts);
                                    const flagged = !isSkipped && (load.over > 0 || overWindow > 0 || fit.outside);
                                    // The job side of the day — this shift's window and every other
                                    // booking — moved to a tooltip. The cell shows the MEMBER's hours;
                                    // which windows fill them is the follow-up question, not the first one.
                                    const dayLines: TipLine[] = isSkipped ? [] : [
                                        { tone: 'lead', text: `${allocName || t('modals.CrewSelectionModal.thisShift')}: ${formatWindow(shiftWin.startTime, shiftWin.endTime)} · ${fmtHours(numAssigned)}h` },
                                        ...elsewhere.map((c): TipLine => ({ tone: 'muted', text: `${c.shiftName ? `${c.jobName} · ${c.shiftName}` : c.jobName}: ${c.startTime && c.endTime ? `${formatWindow(c.startTime, c.endTime)} · ` : ''}${fmtHours(c.hours)}h` })),
                                        { tone: 'muted', text: t('modals.CrewSelectionModal.dayUsedOf', { used: fmtHours(load.used), capacity: fmtHours(load.capacity) }) },
                                        // Why the capacity is short of the window on the caption line.
                                        ...(unpaidBreak > 0 ? [{ tone: 'muted' as const, text: t('modals.CrewSelectionModal.unpaidBreak', { label: unpaidLabel, hours: fmtHours(unpaidBreak) }) }] : []),
                                        // Why the warning triangle is there, in the same order it
                                        // gets raised: off, then the window it sits outside, then the
                                        // two ways the hours can be too many. Being off already
                                        // explains itself, so the past-their-day line stands down.
                                        ...(off ? [{ tone: 'warn' as const, text: avail.reason
                                            ? t('modals.CrewSelectionModal.offThisDayReason', { name: member.name, reason: avail.reason })
                                            : t('modals.CrewSelectionModal.offThisDay', { name: member.name }) }] : []),
                                        ...(fit.outside ? [{ tone: 'warn' as const, text: t('modals.CrewSelectionModal.outsideWorkWindow', { window: formatWindow(avail.startTime, avail.endTime) }) }] : []),
                                        ...(!off && load.over > 0 ? [{ tone: 'warn' as const, text: t('modals.CrewSelectionModal.pastTheirDay', { over: fmtHours(load.over), capacity: fmtHours(load.capacity) }) }] : []),
                                        ...(overWindow > 0 ? [{ tone: 'warn' as const, text: t('modals.CrewSelectionModal.pastShiftWindow', { over: fmtHours(overWindow), window: fmtHours(shiftWindow) }) }] : []),
                                    ];

                                    return (
                                        <td
                                            key={dStr}
                                            onMouseEnter={e => {
                                                if (!dayLines.length) return;
                                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                // Prefer above the cell; flip below when there isn't room.
                                                const above = r.top > 160;
                                                setDayTip({ x: r.left + r.width / 2, y: above ? r.top - 8 : r.bottom + 8, above, lines: dayLines });
                                            }}
                                            onMouseLeave={() => setDayTip(null)}
                                            className={`p-2 border-b border-l border-gray-100 dark:border-gray-700 text-center relative ${isSkipped ? 'bg-gray-100 dark:bg-gray-800 opacity-60' : `${isWeekend ? 'bg-gray-50/50 dark:bg-gray-800/30' : ''}`}`}
                                        >
                                            <div className="relative w-full">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="24"
                                                    step="0.5"
                                                    className={`mx-auto block w-16 text-center font-bold text-sm py-1.5 rounded-lg border outline-none transition-all ${
                                                        flagged
                                                            ? 'border-orange-300 bg-orange-50 text-orange-700 ring-2 ring-orange-100'
                                                            : (numAssigned > 0 ? 'border-gray-400 bg-white text-gray-900 shadow-sm' : 'border-gray-400 bg-white text-gray-900')
                                                    } dark:bg-gray-800 dark:border-gray-500 dark:text-white`}
                                                    value={assigned}
                                                    disabled={isSkipped}
                                                    onChange={(e) => handleCellChange(member.id, dStr, e.target.value)}
                                                    placeholder="-"
                                                />

                                                {flagged && (
                                                    // Hovering the triangle shows the cell's tooltip (pointer-events
                                                    // pass through to the td), and its aria-label carries the same
                                                    // reasons for anyone not using a mouse.
                                                    <div
                                                        className="absolute -top-1 right-3 text-orange-500 bg-white rounded-full shadow-sm z-20 pointer-events-none"
                                                        role="img"
                                                        aria-label={dayLines.filter(l => l.tone === 'warn').map(l => l.text).join('. ')}
                                                    >
                                                        <AlertTriangle className="w-4 h-4 fill-current" />
                                                    </div>
                                                )}

                                                {/* The MEMBER's day, not the job's: their own working hours for this
                                                    date, and what those hours have left after everything booked on them.
                                                    The shift window was identical down every column, which made it
                                                    decoration; the windows filling the day live in the tooltip. */}
                                                <div className="mt-1.5 text-[9px] leading-tight text-left">
                                                    {isSkipped ? (
                                                        <div className="text-center font-medium text-gray-400">
                                                            {t('modals.CrewSelectionModal.dayNotInShift')}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-baseline justify-between gap-1 tabular-nums">
                                                            <span className={`font-bold whitespace-nowrap ${
                                                                off ? 'text-gray-400' : fit.outside ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-200'
                                                            }`}>
                                                                {off ? formatAvailWindow(avail) : formatWindow(avail.startTime, avail.endTime)}
                                                            </span>
                                                            <span className={`font-bold whitespace-nowrap ${load.over > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-500'}`}>
                                                                {load.over > 0
                                                                    ? t('modals.CrewSelectionModal.hoursOver', { hours: fmtHours(load.over) })
                                                                    : t('modals.CrewSelectionModal.hoursLeftShort', { hours: fmtHours(load.left) })}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    )
                                })}
                                <td className="border-b border-l border-gray-100 dark:border-gray-700" />
                            </tr>
                            );
                        })}
                        {selectedMembers.length === 0 && (
                            <tr>
                                <td colSpan={dateRange.length + 4} className="py-12 text-center text-gray-400">
                                    {t('modals.CrewSelectionModal.noCrewSelected')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
        )}

        {/* --- FOOTER: SUMMARY --- */}
        <div className="pt-4 mt-auto border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <div className="flex items-center gap-6">
                {!isUnscheduled && (
                <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">{t('modals.CrewSelectionModal.totalManHours')}</span>
                    <span className="text-xl font-black text-primary-600 dark:text-primary-400">{fmtHours(totalHours)}h</span>
                </div>
                )}
                {/* The job's estimate beside the assigned total, with the gap called out,
                    so the scheduler can compare without leaving the modal. Hidden when the
                    caller has no estimate. */}
                {!isUnscheduled && typeof estHours === 'number' && estHours > 0 && (
                <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">{t('modals.CrewSelectionModal.estimatedHours')}</span>
                    <span className="text-xl font-black text-gray-900 dark:text-white">
                        {fmtHours(estHours)}h
                        {totalHours !== estHours && (
                            <span className={`text-[11px] font-bold ml-1.5 align-middle ${totalHours > estHours ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-500'}`}>
                                {totalHours > estHours
                                    ? t('modals.CrewSelectionModal.hoursOver', { hours: fmtHours(totalHours - estHours) })
                                    : t('modals.CrewSelectionModal.hoursFree', { hours: fmtHours(estHours - totalHours) })}
                            </span>
                        )}
                    </span>
                </div>
                )}
                <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">{t('modals.CrewSelectionModal.crewSize')}</span>
                    <span className="text-xl font-black text-gray-900 dark:text-white">{selectedIds.length}</span>
                </div>
            </div>
            <div className="flex gap-3 items-center">
                {noWorkedDays && (
                    <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                        {t('modals.CrewSelectionModal.noDaysSelected')}
                    </span>
                )}
                <Button variant="secondary" onClick={onClose}>{t('modals.CrewSelectionModal.cancel')}</Button>
                <Button onClick={handleSave} disabled={selectedIds.length === 0 || noWorkedDays} className="shadow-lg shadow-primary-500/20">
                    {confirmLabel ?? (simplified ? t('modals.CrewSelectionModal.saveCrew') : t('modals.CrewSelectionModal.confirmSchedule'))}
                </Button>
            </div>
        </div>
        </>
        )}
      </div>

      {/* Portalled to the body: this modal's own box is transformed and clips overflow,
          which would trap a nested fixed overlay inside it. */}
      {hoursMember && createPortal(
        <AssignHoursModal
          isOpen
          memberName={hoursMember.name}
          jobs={hoursJobs}
          lockedJobId={hoursJobs[0].id}
          getDays={getHoursDays}
          onEditBreaks={onEditMember ? (dateKey) => setBreakEdit({ memberId: hoursMember.id, dateKey }) : undefined}
          hidden={!!breakEdit}
          getWarnings={(_jobId, h) => { const ctx = hoursContext(h); return ctx ? detectAssignHoursWarnings(ctx) : []; }}
          getProgress={(_jobId, h) => { const ctx = hoursContext(h); return ctx ? jobHoursProgress(ctx.jobTotalOther, ctx.enteredTotal, ctx.estHours) : null; }}
          onClose={() => setHoursMemberId(null)}
          onSubmit={handleHoursSubmit}
        />,
        document.body,
      )}

      {/* Break editor, above the popup that opened it — both portalled, this one last. */}
      {breakEdit && hoursMember && createPortal(
        <BreakEditorModal
          memberName={hoursMember.name}
          dateKey={breakEdit.dateKey}
          initialBreaks={resolveBreaks(hoursMember.schedule?.[breakEdit.dateKey], defaultBreaks)}
          isDefault={hoursMember.schedule?.[breakEdit.dateKey]?.breaksOverride === undefined}
          onClose={() => setBreakEdit(null)}
          onSave={(breaks) => handleBreaksSave(hoursMember, breakEdit.dateKey, breaks)}
          onResetToDefault={() => handleBreaksSave(hoursMember, breakEdit.dateKey, undefined)}
        />,
        document.body,
      )}

      {dayTip && createPortal(
        <div
          role="tooltip"
          style={{ left: dayTip.x, top: dayTip.y, transform: `translate(-50%, ${dayTip.above ? '-100%' : '0'})` }}
          className="fixed z-[100] pointer-events-none w-max max-w-[16rem] rounded-lg bg-gray-900 text-white shadow-xl px-2.5 py-2 space-y-0.5"
        >
          {dayTip.lines.map((line, i) => (
            <div
              key={i}
              className={`text-[11px] leading-tight tabular-nums ${
                line.tone === 'lead' ? 'font-bold'
                  : line.tone === 'warn' ? 'font-bold text-orange-300'
                  : 'text-gray-300'
              }`}
            >
              {line.text}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Modal>
  );
};
