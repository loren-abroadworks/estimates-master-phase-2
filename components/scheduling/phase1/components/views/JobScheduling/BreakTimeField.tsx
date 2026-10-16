import React from 'react';
import { TimeInput } from '../../UI';
import { Typography } from '../../../theme/designSystem';
import { useTranslation } from '../../../i18n/LanguageContext';

interface BreakTimeFieldProps {
  /** 'HH:mm' = fixed time; undefined/'' = flexible (anytime). */
  value: string | undefined;
  onChange: (val: string | undefined) => void;
  step?: number;
}

const DEFAULT_TIME = '12:00';

export const BreakTimeField = ({ value, onChange, step = 300 }: BreakTimeFieldProps) => {
  const { t } = useTranslation();
  const hasTime = !!value;

  const segBtn = (active: boolean) =>
    `flex-1 py-2 px-3 rounded-lg text-sm font-bold border transition-colors ${
      active
        ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
        : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'
    }`;

  return (
    <div className="flex flex-col gap-2 w-full">
      <span className={Typography.label}>{t('views.JobScheduling.BreakTimeField.timeLabel')}</span>
      <div className="flex gap-2">
        <button
          type="button"
          className={segBtn(hasTime)}
          onClick={() => onChange(value || DEFAULT_TIME)}
        >
          {t('views.JobScheduling.BreakTimeField.atSetTime')}
        </button>
        <button
          type="button"
          className={segBtn(!hasTime)}
          onClick={() => onChange(undefined)}
        >
          {t('views.JobScheduling.BreakTimeField.anytime')}
        </button>
      </div>
      {hasTime && (
        <TimeInput value={value} step={step} onChange={(v) => onChange(v || undefined)} />
      )}
    </div>
  );
};
