import React from 'react';
import type { CrewMemberLite } from './ReschedulePreviewPanel';

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';

export const CrewAvatar = ({ m, size = 'md' }: { m: CrewMemberLite; size?: 'xs' | 'sm' | 'md' }) => {
  const dim = size === 'xs' ? 'w-5 h-5 text-[9px]' : size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-[11px]';
  return (
    <span
      className={`grid place-items-center ${dim} rounded-full overflow-hidden ring-2 ring-white dark:ring-gray-900 shrink-0 font-black text-white`}
      style={{ backgroundColor: m.color || '#64748b' }}
      title={m.name}
    >
      {m.photo ? <img src={m.photo} alt={m.name} className="w-full h-full object-cover" /> : initials(m.name)}
    </span>
  );
};
