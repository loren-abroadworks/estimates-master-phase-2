'use client';

/*
  Admin Portal menu pages not built in this replica yet (Tier Management,
  Add-on Plans, Fulfillment, Coupons, Team Access). The built pages have
  their own folders and take precedence over this route.
*/
import React, { use } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Construction } from 'lucide-react';
import { PLATFORM_NAV, PlatformShell } from '@/components/platform/PlatformShell';
import { EmptyState, PageHeader } from '@/components/ui/display';

export default function PlatformSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const item = PLATFORM_NAV.find((n) => n.href === `/platform/${section}`);
  if (!item) notFound();
  return (
    <PlatformShell title={item.label}>
      <PageHeader title={item.label} />
      <EmptyState
        icon={<Construction />}
        title="Not built yet"
        message={`${item.label} isn't part of this replica yet.`}
        action={<Link href="/platform/dashboard" className="text-sm font-bold text-primary-600 hover:underline">Back to the dashboard</Link>}
      />
    </PlatformShell>
  );
}
