import React from 'react';
import { GripVertical, CheckCircle2, Clock } from 'lucide-react';
import type { Job } from '../../../types';
import { JOB_DND_TYPE } from './jobDnd';
import { useTranslation } from '../../../i18n/LanguageContext';

export interface UnscheduledJobCard {
  job: Job;
  clientName?: string;
  color: string;
  estHours?: number;
}

interface UnscheduledJobsPanelProps {
  cards: UnscheduledJobCard[];
  canReschedule: boolean;
  onSelectJob: (jobId: string) => void;
}

// Active jobs not yet placed on the calendar: no startDate, excluding Cancelled.
export const selectUnscheduledJobs = (jobs: Job[]): Job[] =>
  jobs.filter(j => !j.startDate && j.stage !== 'Cancelled');

export const UnscheduledJobsPanel = ({ cards, canReschedule, onSelectJob }: UnscheduledJobsPanelProps) => {
  const { t } = useTranslation();
  return (
  <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5 mt-6">
    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">{t('views.JobScheduling.UnscheduledJobsPanel.heading')}</h3>
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {cards.map(({ job, clientName, color, estHours }) => (
        <li
          key={job.id}
          draggable={canReschedule}
          onDragStart={canReschedule ? (e) => {
            e.dataTransfer.setData(JOB_DND_TYPE, job.id);
            e.dataTransfer.effectAllowed = 'copy';
          } : undefined}
          onClick={() => onSelectJob(job.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectJob(job.id); } }}
          role="button"
          tabIndex={0}
          title={canReschedule
            ? t('views.JobScheduling.UnscheduledJobsPanel.titleWithDrag', { jobNumber: job.jobNumber, jobName: job.name })
            : t('views.JobScheduling.UnscheduledJobsPanel.titleNoDrag', { jobNumber: job.jobNumber, jobName: job.name })}
          className={`group relative rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 p-3 pl-4 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 transition-all ${canReschedule ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
        >
          <span className="absolute left-0 top-2 bottom-2 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-gray-900 dark:text-white truncate">{job.name}</div>
              <div className="text-[11px] text-gray-400 truncate">{job.jobNumber}{clientName ? ` · ${clientName}` : ''}</div>
            </div>
            {canReschedule && <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0 group-hover:text-gray-400" />}
          </div>
          {estHours != null && estHours > 0 && (
            <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-400">
              <Clock className="w-3.5 h-3.5" /> {t('views.JobScheduling.UnscheduledJobsPanel.estHours', { estHours })}
            </div>
          )}
        </li>
      ))}
    </ul>
    {cards.length === 0 && (
      <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
        <CheckCircle2 className="w-4 h-4" /> {t('views.JobScheduling.UnscheduledJobsPanel.allScheduled')}
      </p>
    )}
  </div>
  );
};
