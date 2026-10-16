import React, { useState } from 'react';
import { Sparkles, CloudRain, Mail, Wand2, ChevronDown } from 'lucide-react';
import type { RescheduleImpact } from '../../../services/rescheduleImpact';
import { buildCustomerMessages } from '../../../services/rescheduleImpact';
import { formatDisplayDate } from '../../../services/scheduleEngine';
import { useTranslation } from '../../../i18n/LanguageContext';

interface SmartSuggestionsCardProps {
  impact: RescheduleImpact;
  hasSuggestions: boolean;
  onAutoFix: () => void;
}

export const SmartSuggestionsCard = ({ impact, hasSuggestions, onAutoFix }: SmartSuggestionsCardProps) => {
  const { t } = useTranslation();
  const [showWeather, setShowWeather] = useState(false);
  const [showMessages, setShowMessages] = useState(false);

  const hasWeather = impact.weatherHits.length > 0;
  const hasCustomers = impact.customerUpdates.length > 0;
  if (!hasSuggestions && !hasWeather && !hasCustomers) return null;

  const messages = buildCustomerMessages(impact.customerUpdates);
  const fmtDay = (key: string) =>
    new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

  const weatherJobs = impact.weatherHits.reduce((n, h) => n + h.jobCount, 0);

  return (
    <div className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gradient-to-b from-primary-50/50 to-transparent dark:from-primary-900/10 p-3.5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-black text-gray-900 dark:text-white">
        <Sparkles className="w-4 h-4 text-primary-500" /> {t('views.JobScheduling.SmartSuggestionsCard.smartSuggestions')}
      </div>

      {hasSuggestions && (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/70 dark:bg-green-900/20 p-3">
          <div className="flex items-start gap-2.5">
            <div className="grid place-items-center w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 shrink-0">
              <Wand2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-green-800 dark:text-green-300">{t('views.JobScheduling.SmartSuggestionsCard.autoFixRecommended')}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{t('views.JobScheduling.SmartSuggestionsCard.autoFixDescription')}</div>
            </div>
          </div>
          <button
            onClick={onAutoFix}
            className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors active:scale-[0.98]"
          >
            <Wand2 className="w-3.5 h-3.5" /> {t('views.JobScheduling.SmartSuggestionsCard.fixForMe')}
          </button>
        </div>
      )}

      {hasWeather && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/20 p-3">
          <div className="flex items-start gap-2.5">
            <div className="grid place-items-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 shrink-0">
              <CloudRain className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-gray-900 dark:text-white">{t('views.JobScheduling.SmartSuggestionsCard.weatherAlert')}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                {t('views.JobScheduling.SmartSuggestionsCard.weatherAlertDescription', { days: impact.weatherHits.map(h => fmtDay(h.dateKey)).join(' & '), count: String(weatherJobs), jobSuffix: weatherJobs === 1 ? '' : 's' })}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowWeather(s => !s)}
            className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 bg-white/60 dark:bg-transparent hover:bg-blue-100/70 dark:hover:bg-blue-900/40 transition-colors"
          >
            {t('views.JobScheduling.SmartSuggestionsCard.viewWeather')} <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showWeather ? 'rotate-180' : ''}`} />
          </button>
          {showWeather && (
            <ul className="mt-2.5 space-y-1 text-xs">
              {impact.weatherHits.map(h => (
                <li key={h.dateKey} className="flex items-center justify-between rounded-lg bg-white/70 dark:bg-gray-900/40 px-2.5 py-1.5">
                  <span className="text-gray-600 dark:text-gray-300">{fmtDay(h.dateKey)} · {formatDisplayDate(h.dateKey)}</span>
                  <span className="capitalize font-bold text-blue-700 dark:text-blue-300">{h.kind}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {hasCustomers && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/50 p-3">
          <div className="flex items-start gap-2.5">
            <div className="grid place-items-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-gray-900 dark:text-white">{t('views.JobScheduling.SmartSuggestionsCard.customerUpdates')}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                {t('views.JobScheduling.SmartSuggestionsCard.customerUpdatesDescription', { count: String(impact.customerUpdates.length), customerSuffix: impact.customerUpdates.length === 1 ? '' : 's' })}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowMessages(s => !s)}
            className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {t('views.JobScheduling.SmartSuggestionsCard.previewMessages')} <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMessages ? 'rotate-180' : ''}`} />
          </button>
          {showMessages && (
            <ul className="mt-2.5 space-y-2 text-xs">
              {messages.map((m, i) => (
                <li key={i} className="rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 p-2.5">
                  <div className="font-bold text-gray-800 dark:text-gray-100">{m.clientName}</div>
                  <div className="text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{m.message}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
