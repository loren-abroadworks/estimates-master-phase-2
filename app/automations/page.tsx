'use client';

import { Suspense } from 'react';
import { WorkflowsPage } from '@/components/automations/workflows/WorkflowsPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <WorkflowsPage />
    </Suspense>
  );
}
