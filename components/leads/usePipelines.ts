'use client';

/*
  The pipelines shown on screens, in Settings order (CRM Part 2).
  - Sales always; Production while CRM is on in New Features.
  - Custom pipelines (Training, Marketing…) only with dynamicPipelines on
    (Option B). With it off (Option A) they are hidden, not deleted.
*/
import { useMemo } from 'react';
import { useCollection } from '@/lib/store';
import { useDynamicPipelines, useIsOn } from '@/features/lib/feature-visibility';

export function useVisiblePipelines() {
  const { items } = useCollection('pipelines');
  const crmOn = useIsOn({ featureKey: 'crm' });
  const dynamic = useDynamicPipelines();
  return useMemo(
    () => [...items].filter((p) => p.kind === 'sales' || (crmOn && (p.kind === 'production' || dynamic))).sort((a, b) => a.sortOrder - b.sortOrder),
    [items, crmOn, dynamic],
  );
}
