import React from 'react';
import type { Job } from '../../../types';
import { formatDisplayDate } from '../../../services/scheduleEngine';

interface Props {
  open: boolean;
  job: Job;
  onPick: (shiftId: string | 'new') => void;
  onClose: () => void;
}

/** Choose which shift a dropped job assigns into, shown when the job has 2+ shifts. */
export const ShiftPickerModal: React.FC<Props> = ({ open, job, onPick, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-80 rounded-lg bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Assign to which shift?</h3>
        <div className="space-y-2">
          {(job.allocations ?? []).map(a => (
            <button key={a.id} onClick={() => onPick(a.id)}
              className="flex w-full items-center justify-between rounded border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50">
              <span className="font-medium text-slate-800">{a.name}</span>
              <span className="text-xs text-slate-500">
                {a.startDate ? formatDisplayDate(a.startDate) : ''}
              </span>
            </button>
          ))}
          <button onClick={() => onPick('new')}
            className="w-full rounded border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            + New shift
          </button>
        </div>
      </div>
    </div>
  );
};
