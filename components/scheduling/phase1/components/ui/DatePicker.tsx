
import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

interface DatePickerProps {
  label?: string;
  value: string;
  onChange: (date: string) => void;
  className?: string;
  align?: 'left' | 'right' | 'center';
  /** Return true for a 'YYYY-MM-DD' day that cannot be selected (e.g. a
   *  non-working day). Disabled days render muted and ignore clicks. */
  isDateDisabled?: (dateKey: string) => boolean;
  /** Replace the default field trigger with a custom element (e.g. a heading).
   *  The calendar popover and outside-click behavior are unchanged. */
  renderTrigger?: (open: () => void, isOpen: boolean) => React.ReactNode;
  /** 'month' turns the picker into a month picker: it opens on the month grid,
   *  drills up to years only, and commits the first day of the picked month. */
  granularity?: 'day' | 'month';
}

type ViewMode = 'days' | 'months' | 'years';

export const DatePicker = ({ label, value, onChange, className = "", align = 'left', isDateDisabled, renderTrigger, granularity = 'day' }: DatePickerProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Parse value or default to today
  const dateValue = value ? new Date(value) : new Date();
  // Adjust for timezone offset if needed, or treat string as local YYYY-MM-DD
  // Simple handling: if value is YYYY-MM-DD, parse as local
  if (value) {
      const [y, m, d] = value.split('-').map(Number);
      dateValue.setFullYear(y, m - 1, d);
  }

  const [viewDate, setViewDate] = useState(new Date(dateValue));
  const [viewMode, setViewMode] = useState<ViewMode>(granularity === 'month' ? 'months' : 'days');
  const [yearViewStart, setYearViewStart] = useState(Math.floor(viewDate.getFullYear() / 12) * 12);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Update viewDate if prop changes
  useEffect(() => {
      if (value) {
          const [y, m, d] = value.split('-').map(Number);
          const newDate = new Date();
          newDate.setFullYear(y, m - 1, d);
          setViewDate(newDate);
          setYearViewStart(Math.floor(y / 12) * 12);
      }
  }, [value]);

  const handlePrev = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (viewMode === 'days') {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
      } else if (viewMode === 'months') {
        setViewDate(new Date(viewDate.getFullYear() - 1, viewDate.getMonth(), 1));
      } else {
        setYearViewStart(yearViewStart - 12);
      }
  };

  const handleNext = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (viewMode === 'days') {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
      } else if (viewMode === 'months') {
        setViewDate(new Date(viewDate.getFullYear() + 1, viewDate.getMonth(), 1));
      } else {
        setYearViewStart(yearViewStart + 12);
      }
  };

  const toggleViewMode = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (viewMode === 'days') setViewMode('months');
      else if (viewMode === 'months') setViewMode('years');
      else setViewMode(granularity === 'month' ? 'months' : 'days');
  };

  const handleSelectDate = (d: number) => {
      const selected = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
      // Format to YYYY-MM-DD
      const y = selected.getFullYear();
      const m = String(selected.getMonth() + 1).padStart(2, '0');
      const day = String(selected.getDate()).padStart(2, '0');
      onChange(`${y}-${m}-${day}`);
      setIsOpen(false);
      setViewMode('days');
  };

  const handleSelectMonth = (monthIndex: number) => {
      if (granularity === 'month') {
          const y = viewDate.getFullYear();
          onChange(`${y}-${String(monthIndex + 1).padStart(2, '0')}-01`);
          setIsOpen(false);
          setViewMode('months');
          return;
      }
      const newDate = new Date(viewDate);
      newDate.setMonth(monthIndex);
      setViewDate(newDate);
      setViewMode('days');
  };

  const handleSelectYear = (year: number) => {
      const newDate = new Date(viewDate);
      newDate.setFullYear(year);
      setViewDate(newDate);
      setViewMode('months'); // Drill down naturally
  };

  // Renderers
  const renderDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDayOffset = new Date(year, month, 1).getDay();
    
    const grid = [];
    for(let i=0; i<startDayOffset; i++) grid.push(null);
    for(let i=1; i<=daysInMonth; i++) grid.push(i);

    return (
        <>
            <div className="grid grid-cols-7 mb-2">
                {[t('ui.DatePicker.daySun'),t('ui.DatePicker.dayMon'),t('ui.DatePicker.dayTue'),t('ui.DatePicker.dayWed'),t('ui.DatePicker.dayThu'),t('ui.DatePicker.dayFri'),t('ui.DatePicker.daySat')].map(d => <div key={d} className="text-center text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {grid.map((d, i) => {
                    if (!d) return <div key={i} className="h-9 flex items-center justify-center"><div /></div>;
                    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const disabled = isDateDisabled?.(dateKey) ?? false;
                    const isSelected = value && new Date(value).getDate() === d && new Date(value).getMonth() === month && new Date(value).getFullYear() === year;
                    return (
                        <div key={i} className="h-9 flex items-center justify-center">
                            <button
                                disabled={disabled}
                                title={disabled ? t('ui.DatePicker.nonWorkingDay') : undefined}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) handleSelectDate(d); }}
                                className={`w-8 h-8 rounded-full text-sm flex items-center justify-center transition-all ${
                                    disabled
                                    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' :
                                    isSelected
                                    ? 'bg-primary-600 text-white font-bold shadow-md' :
                                    'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium'
                                }`}
                            >
                                {d}
                            </button>
                        </div>
                    );
                })}
            </div>
        </>
    );
  };

  const renderMonths = () => {
      const months = [t('ui.DatePicker.monthJan'),t('ui.DatePicker.monthFeb'),t('ui.DatePicker.monthMar'),t('ui.DatePicker.monthApr'),t('ui.DatePicker.monthMay'),t('ui.DatePicker.monthJun'),t('ui.DatePicker.monthJul'),t('ui.DatePicker.monthAug'),t('ui.DatePicker.monthSep'),t('ui.DatePicker.monthOct'),t('ui.DatePicker.monthNov'),t('ui.DatePicker.monthDec')];
      const isMonthSelected = (i: number) => granularity === 'month' && value
          ? dateValue.getFullYear() === viewDate.getFullYear() && dateValue.getMonth() === i
          : i === viewDate.getMonth();
      return (
          <div className="grid grid-cols-3 gap-2">
              {months.map((m, i) => (
                  <button
                    key={m}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSelectMonth(i); }}
                    className={`py-3 rounded-lg text-sm font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${isMonthSelected(i) ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-800' : 'text-gray-700 dark:text-gray-300 border border-transparent'}`}
                  >
                      {m}
                  </button>
              ))}
          </div>
      );
  };

  const renderYears = () => {
      const years = Array.from({length: 12}, (_, i) => yearViewStart + i);
      return (
          <div className="grid grid-cols-3 gap-2">
              {years.map(y => (
                  <button
                    key={y}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSelectYear(y); }}
                    className={`py-3 rounded-lg text-sm font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${y === viewDate.getFullYear() ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-800' : 'text-gray-700 dark:text-gray-300 border border-transparent'}`}
                  >
                      {y}
                  </button>
              ))}
          </div>
      );
  };

  const getHeaderLabel = () => {
      if (viewMode === 'days') return viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (viewMode === 'months') return viewDate.getFullYear().toString();
      if (viewMode === 'years') return `${yearViewStart} - ${yearViewStart + 11}`;
      return '';
  };

  const displayValue = value ? new Date(value + 'T00:00:00').toLocaleDateString() : '';

  const toggleOpen = () => {
      if (!isOpen) setViewMode(granularity === 'month' ? 'months' : 'days');
      setIsOpen(!isOpen);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 block">{label}</label>}

      {renderTrigger ? renderTrigger(toggleOpen, isOpen) : (
      <div
        onClick={toggleOpen}
        className="w-full px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-400 dark:border-gray-500 rounded-xl flex items-center justify-between cursor-pointer hover:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 transition-all group"
      >
          <span className={`text-sm font-bold ${value ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
              {displayValue || t('ui.DatePicker.selectDate')}
          </span>
          <Calendar className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors" />
      </div>
      )}

      {isOpen && (
        <div className={`absolute top-full ${align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'} mt-2 z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 w-72 animate-in fade-in zoom-in-95 duration-100`}>
             <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                  <button onClick={handlePrev} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                  <button onClick={toggleViewMode} className="font-bold text-gray-900 dark:text-white text-sm hover:text-primary-600 dark:hover:text-primary-400 transition-colors px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                      {getHeaderLabel()}
                  </button>
                  <button onClick={handleNext} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"><ChevronRight className="w-5 h-5" /></button>
              </div>
              
              {viewMode === 'days' && renderDays()}
              {viewMode === 'months' && renderMonths()}
              {viewMode === 'years' && renderYears()}
        </div>
      )}
    </div>
  );
};
