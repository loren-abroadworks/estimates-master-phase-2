import type { ProposedChange } from './scheduleEngine';
import type { Job } from '../types';

export interface StagedReschedule {
  /** Proposed changes to preview (includes skipped/informational rows). */
  changes: ProposedChange[];
  /** Human label, reused as the undo/toast label on commit. */
  label: string;
  /** Performs the actual commit + side effects (calls App.handleApplySchedule). */
  commit: (effective: ProposedChange[]) => void;
  /** Current delay (days) for cascade reschedules; seeds the Delay-by control. */
  delayDays?: number;
  /** Re-runs the reschedule at a new delay; absent for non-cascade moves. */
  recompute?: (delayDays: number) => ProposedChange[];
  /** Which drawer experience to render: single-job editor vs bulk preview. */
  mode: 'edit' | 'bulk';
  /** In edit mode, the job actually being edited (the editor + header key off it,
   *  even when cascade adds follower rows to `changes`). */
  primaryJobId?: string;
  /** Management mode: the working copy of the primary job whose shifts are being edited.
   *  When set, the drawer renders shift cards from it and Apply commits it; `changes`
   *  then carries only cascade followers on OTHER jobs. */
  draftJob?: Job;
}

export interface PreviewState {
  staged: StagedReschedule | null;
}

export type PreviewAction =
  | { type: 'STAGE'; payload: StagedReschedule }
  | { type: 'CLEAR' }
  | { type: 'SET_CHANGES'; payload: ProposedChange[] }
  | { type: 'SET_DRAFT'; payload: Job };

export const initialPreviewState: PreviewState = { staged: null };

export const previewReducer = (state: PreviewState, action: PreviewAction): PreviewState => {
  switch (action.type) {
    case 'STAGE': return { staged: action.payload };
    case 'CLEAR': return { staged: null };
    case 'SET_CHANGES':
      return state.staged ? { staged: { ...state.staged, changes: action.payload } } : state;
    case 'SET_DRAFT':
      return state.staged ? { staged: { ...state.staged, draftJob: action.payload } } : state;
    default: return state;
  }
};

export const summarizeStaged = (changes: ProposedChange[]) => ({
  changedCount: changes.filter(c => !c.skipped).length,
  skippedCount: changes.filter(c => c.skipped).length,
});
