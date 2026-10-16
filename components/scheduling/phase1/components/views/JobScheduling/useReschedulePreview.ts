import { useReducer, useCallback } from 'react';
import {
  previewReducer, initialPreviewState, StagedReschedule, summarizeStaged,
} from '../../../services/reschedulePreview';
import type { ProposedChange } from '../../../services/scheduleEngine';
import type { Job } from '../../../types';

export const useReschedulePreview = () => {
  const [state, dispatch] = useReducer(previewReducer, initialPreviewState);

  const stage = useCallback((payload: StagedReschedule) => {
    dispatch({ type: 'STAGE', payload });
  }, []);
  const clear = useCallback(() => dispatch({ type: 'CLEAR' }), []);
  const setChanges = useCallback((changes: ProposedChange[]) => {
    dispatch({ type: 'SET_CHANGES', payload: changes });
  }, []);
  const setDraft = useCallback((job: Job) => {
    dispatch({ type: 'SET_DRAFT', payload: job });
  }, []);

  return {
    staged: state.staged,
    isPreviewing: state.staged !== null,
    summary: state.staged ? summarizeStaged(state.staged.changes) : null,
    stage,
    clear,
    setChanges,
    setDraft,
  };
};
