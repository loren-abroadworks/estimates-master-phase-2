import React from 'react';
import { RescheduleImpact } from '../../../../services/rescheduleImpact';
import { useTranslation } from '../../../../i18n/LanguageContext';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

const StatTile = ({ label, value, accent, details }: { label: string; value: React.ReactNode; accent?: boolean; details?: string[] }) => {
  const hasDetails = !!details && details.length > 0;
  return (
    <div className={`group relative rounded-xl border px-3 py-2.5 ${hasDetails ? 'cursor-help' : ''} ${
      accent
        ? 'border-primary-200 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-900/20'
        : 'border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/60'
    }`}>
      <div className={`font-heading font-black leading-none tracking-tight ${accent ? 'text-primary-700 dark:text-primary-300' : 'text-gray-900 dark:text-white'} text-2xl`}>{value}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</div>
      {hasDetails && (
        <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-max max-w-[220px] -translate-x-1/2 group-hover:block animate-in fade-in zoom-in-95 duration-150">
          <div className="rounded-lg bg-gray-900 dark:bg-gray-700 px-3 py-2 text-left shadow-xl">
            <ul className="space-y-0.5">
              {details.map((d, i) => (
                <li key={i} className="text-xs font-medium text-white truncate">{d}</li>
              ))}
            </ul>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 bg-gray-900 dark:bg-gray-700" />
          </div>
        </div>
      )}
    </div>
  );
};

export const ImpactTiles = ({ impact }: { impact: RescheduleImpact }) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-2">
      <StatTile label={t('views.JobScheduling.reschedule.ImpactTiles.jobsAffected')} value={impact.jobsAffected} accent details={impact.affectedJobNames} />
      <StatTile label={t('views.JobScheduling.reschedule.ImpactTiles.crewsAffected')} value={impact.crewsAffected} details={impact.affectedCrewNames} />
      <StatTile label={t('views.JobScheduling.reschedule.ImpactTiles.totalDelay')} value={`${impact.totalDelayDays}d`} />
      <StatTile label={t('views.JobScheduling.reschedule.ImpactTiles.newEndDate')} value={<span className="text-base">{fmtDate(impact.newEndDate)}</span>} />
    </div>
  );
};
