import React from 'react';
import { Lock } from 'lucide-react';
import { BoardCard } from '../../../services/productionBoard';
import { CrewAvatar } from './CrewAvatar';
import type { CrewMemberLite } from './ReschedulePreviewPanel';
import { useTranslation } from '../../../i18n/LanguageContext';

const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

interface JobCardProps {
  card: BoardCard;
  draggable: boolean;
  onPointerDownDrag: (card: BoardCard, e: React.PointerEvent) => void;
  onClick?: (jobId: string) => void;
  onMoveJob?: (jobId: string) => void;
  durationDays?: number;
  /** Roster used to resolve the card's crew into avatars; omit to hide the stack. */
  staff?: CrewMemberLite[];
  /** Render as a faded, dashed placeholder (e.g. a staged-but-unapplied move). */
  pending?: boolean;
}

export const JobCard = ({ card, draggable, onPointerDownDrag, onClick, onMoveJob, durationDays, staff, pending }: JobCardProps) => {
  const { t } = useTranslation();
  const canDrag = draggable && !card.isLocked;
  // Crew on this bar's shift, resolved against the roster in assignment order.
  const crew = (card.memberIds ?? [])
    .map(id => staff?.find(m => m.id === id))
    .filter((m): m is CrewMemberLite => !!m);
  // A one-day bar only fits a single avatar beside its text; wider bars show up to three.
  const maxAvatars = (durationDays ?? 2) >= 2 ? 3 : 1;
  const visibleCrew = crew.slice(0, maxAvatars);
  const overflow = crew.length - visibleCrew.length;
  const crewSuffix = crew.length ? ` · ${crew.map(m => m.name).join(', ')}` : '';
  const titleSuffix = pending
    ? ` — ${t('views.JobScheduling.JobCard.pendingSuffix')}`
    : onMoveJob
    ? ` — ${t('views.JobScheduling.JobCard.rightClickToMove')}`
    : '';
  return (
    <div
      onPointerDown={(e) => { if (canDrag) onPointerDownDrag(card, e); }}
      onClick={(e) => { e.stopPropagation(); onClick?.(card.jobId); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMoveJob?.(card.jobId); }}
      className={`relative h-full text-white text-xs font-bold pl-2 pr-1.5 py-1 rounded-lg shadow-sm flex items-center gap-2 select-none ${
        canDrag ? 'cursor-grab active:cursor-grabbing touch-none' : 'cursor-pointer'
      } ${pending ? 'border-2 border-dashed border-white/80' : ''}`}
      style={{ backgroundColor: card.color, opacity: card.isLocked ? 0.7 : pending ? 0.6 : 1 }}
      title={`${card.jobName} (${card.jobNumber})${card.shiftName ? ` · ${card.shiftName}` : ''} · ${fmtTime(card.startTime)} – ${fmtTime(card.endTime)}${crewSuffix}${titleSuffix}`}
    >
      {card.isLocked && <Lock className="w-3 h-3 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="truncate">{card.jobName}</div>
        <div className="text-[10px] font-semibold opacity-80 leading-tight truncate">
          {card.shiftName ? `${card.shiftName} · ` : ''}{fmtTime(card.startTime)} – {fmtTime(card.endTime)}
        </div>
      </div>
      {visibleCrew.length > 0 && (
        <div className="flex items-center -space-x-1.5 shrink-0">
          {visibleCrew.map(m => <CrewAvatar key={m.id} m={m} size="sm" />)}
          {overflow > 0 && (
            <span
              className="grid place-items-center w-6 h-6 rounded-full bg-black/30 ring-2 ring-white dark:ring-gray-900 text-[9px] font-black shrink-0"
              title={crew.slice(maxAvatars).map(m => m.name).join(', ')}
            >
              +{overflow}
            </span>
          )}
        </div>
      )}
      {durationDays != null && (
        <span className="shrink-0 text-[10px] font-black opacity-90">{durationDays}{t('views.JobScheduling.JobCard.durationDaysSuffix')}</span>
      )}
    </div>
  );
};
