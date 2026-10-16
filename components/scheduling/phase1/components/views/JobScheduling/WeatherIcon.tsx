import React from 'react';
import { Sun, CloudRain, CloudSnow, CloudLightning, type LucideIcon } from 'lucide-react';
import type { WeatherKind } from '../../../types';
import { useTranslation } from '../../../i18n/LanguageContext';

const WEATHER: Record<WeatherKind, { Icon: LucideIcon; label: string; tone: string }> = {
  clear: { Icon: Sun, label: 'Clear', tone: 'text-amber-500' },
  rain: { Icon: CloudRain, label: 'Rain', tone: 'text-blue-500' },
  storm: { Icon: CloudLightning, label: 'Storm', tone: 'text-indigo-500' },
  snow: { Icon: CloudSnow, label: 'Snow', tone: 'text-sky-400' },
};

const WEATHER_LABEL_KEYS: Record<WeatherKind, string> = {
  clear: 'views.JobScheduling.WeatherIcon.labelClear',
  rain: 'views.JobScheduling.WeatherIcon.labelRain',
  storm: 'views.JobScheduling.WeatherIcon.labelStorm',
  snow: 'views.JobScheduling.WeatherIcon.labelSnow',
};

interface WeatherIconProps {
  kind?: WeatherKind;
  /** Tailwind size classes for the glyph (default w-4 h-4). */
  className?: string;
}

/** Forecast glyph for one day. Renders nothing when there is no forecast. */
export const WeatherIcon = ({ kind, className = 'w-4 h-4' }: WeatherIconProps) => {
  const { t } = useTranslation();
  if (!kind) return null;
  const { Icon, tone } = WEATHER[kind];
  const label = t(WEATHER_LABEL_KEYS[kind]);
  return (
    <span role="img" aria-label={t('views.JobScheduling.WeatherIcon.ariaLabel', { label })} title={label} className="inline-flex shrink-0">
      <Icon className={`${className} ${tone}`} />
    </span>
  );
};
