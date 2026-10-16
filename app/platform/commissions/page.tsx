'use client';

/*
  Admin Portal › Commissions: payments from each rep's subscribers in the
  date range, times the rep's rate. Changing a rate updates the dashboard's
  Commission card.
*/
import React, { useState } from 'react';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { TableCard, td, th } from '@/components/platform/AdminParts';
import { PeriodFilter } from '@/components/dashboard/HeaderControls';
import { PERIOD_OPTIONS, type PeriodValue } from '@/components/dashboard/metrics';
import { PageHeader } from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { useCollection, useDb } from '@/lib/store';
import { money } from '@/lib/utils';
import { commissions } from '@/lib/platform';

const PERIODS = PERIOD_OPTIONS.filter((o) => o.key !== 'this_week');

export default function PlatformCommissionsPage() {
  return <PlatformShell title="Commissions"><Commissions /></PlatformShell>;
}

function Commissions() {
  const db = useDb();
  const staff = useCollection('platformStaff');
  const [period, setPeriod] = useState<PeriodValue>({ preset: 'this_month' });
  const { total, byRep } = commissions(db, period);
  return (
    <>
      <PageHeader title="Commissions" subtitle="What each rep earned on their subscribers' payments." actions={<PeriodFilter value={period} onChange={setPeriod} options={PERIODS} />} />
      <TableCard>
        <thead className="border-b border-gray-100 bg-gray-50">
          <tr><th className={th}>Rep</th><th className={th}>Rate</th><th className={`${th} text-right`}>Payments</th><th className={`${th} text-right`}>Commission</th></tr>
        </thead>
        <tbody>
          {byRep.map(({ staff: s, paid, commission }) => (
            <tr key={s.id} className="border-b border-gray-50 last:border-0">
              <td className={td}><span className="font-bold text-gray-900">{s.name}</span><span className="block text-xs text-gray-500">{s.email}</span></td>
              <td className={td}>
                <div className="w-28">
                  <Input
                    type="number" min={0} max={100} step={1} suffix="%" aria-label={`${s.name} commission rate`}
                    value={Math.round(s.commissionRate * 1000) / 10}
                    onChange={(e) => staff.update(s.id, { commissionRate: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100 })}
                    className="h-10"
                  />
                </div>
              </td>
              <td className={`${td} text-right`}>{money(paid)}</td>
              <td className={`${td} text-right font-bold text-green-600`}>{money(commission)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-gray-200 bg-gray-50">
          <tr><td className={`${td} font-bold text-gray-900`} colSpan={3}>Total</td><td className={`${td} text-right font-heading text-lg font-black text-green-600`}>{money(total)}</td></tr>
        </tfoot>
      </TableCard>
    </>
  );
}
