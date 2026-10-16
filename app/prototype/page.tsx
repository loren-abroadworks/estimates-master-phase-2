'use client';

/*
  Prototype page (prototype only, not part of the live app). Holds the guide
  that used to sit on the dashboard, so the dashboard matches production:
  - New Features: switch each Phase 2 feature on or off (#new-features).
  - Feature tours: one short tour per new feature (#feature-tours).
  Opened from the Prototype bar, from a switched-off screen and after a tour ends.
*/
import { useEffect } from 'react';
import { PageShell } from '@/components/Navigation';
import { PageHeader } from '@/components/ui/display';
import { NewFeaturesPanel } from '@/components/dashboard/NewFeaturesPanel';
import { DemoWalkthroughCard } from '@/components/dashboard/FeatureWidgets';

export default function PrototypePage() {
  useEffect(() => {
    if (window.location.hash === '#feature-tours') document.getElementById('feature-tours')?.scrollIntoView({ block: 'start' });
  }, []);
  return (
    <PageShell title="Prototype" breadcrumbs={['Home']}>
      <PageHeader title="Prototype" subtitle="Switch Phase 2 features on or off and take their tours. Not part of the live app." className="mb-8" />
      <NewFeaturesPanel />
      <DemoWalkthroughCard />
    </PageShell>
  );
}
