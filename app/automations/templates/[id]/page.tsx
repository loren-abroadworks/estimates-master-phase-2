'use client';

import { useParams } from 'next/navigation';
import { TemplateBuilderPage } from '@/components/automations/workflows/BuilderPage';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <TemplateBuilderPage key={id} id={id} />;
}
