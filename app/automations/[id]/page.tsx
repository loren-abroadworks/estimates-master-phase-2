'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { BuilderPage } from '@/components/automations/workflows/BuilderPage';

function Builder() {
  const { id } = useParams<{ id: string }>();
  return <BuilderPage key={id} id={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Builder />
    </Suspense>
  );
}
