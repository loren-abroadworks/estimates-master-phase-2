import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button, TextInput, Toggle, NumberInput } from '../../UI';
import { BreakTimeField } from './BreakTimeField';
import { Typography } from '../../../theme/designSystem';
import type { CrewBreak } from '../../../types';
import { useTranslation } from '../../../i18n/LanguageContext';

interface BreakEditorModalProps {
  memberName: string;
  dateKey: string;
  /** The currently-effective breaks for this day (resolved default-or-override). */
  initialBreaks: CrewBreak[];
  /** Whether this day is currently following the company default (no override set). */
  isDefault: boolean;
  onClose: () => void;
  /** Save the edited list (empty array = explicit "no breaks"). */
  onSave: (breaks: CrewBreak[]) => void;
  /** Drop the override so the day follows the company default again. */
  onResetToDefault: () => void;
}

const newId = (list: CrewBreak[]) => `brk-${list.length + 1}-${list.reduce((s, b) => s + b.durationMinutes, 0)}`;

export const BreakEditorModal = ({
  memberName, dateKey, initialBreaks, isDefault, onClose, onSave, onResetToDefault,
}: BreakEditorModalProps) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CrewBreak[]>(initialBreaks);

  const patch = (id: string, p: Partial<CrewBreak>) => setDraft(d => d.map(b => (b.id === id ? { ...b, ...p } : b)));
  const add = () => setDraft(d => [...d, { id: newId(d), label: 'Break', durationMinutes: 30, paid: false }]);
  const remove = (id: string) => setDraft(d => d.filter(b => b.id !== id));

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white">{t('views.JobScheduling.BreakEditorModal.title', { memberName })}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{dateKey}{isDefault && ` · ${t('views.JobScheduling.BreakEditorModal.followingDefault')}`}</p>
          </div>
          <button onClick={onClose} aria-label={t('views.JobScheduling.BreakEditorModal.close')} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3 max-h-[50vh] overflow-y-auto">
          {draft.length === 0 && <div className="text-center py-6 text-gray-400 italic">{t('views.JobScheduling.BreakEditorModal.noBreaks')}</div>}
          {draft.map((b) => (
            <div key={b.id} className="flex flex-wrap items-end gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex-1 min-w-[120px]">
                <TextInput label={t('views.JobScheduling.BreakEditorModal.labelName')} placeholder={t('views.JobScheduling.BreakEditorModal.placeholderLunch')} value={b.label ?? ''} onChange={(v) => patch(b.id, { label: v })} />
              </div>
              <div className="w-32">
                <NumberInput label={t('views.JobScheduling.BreakEditorModal.labelMinutes')} step={5} value={b.durationMinutes} onChange={(v) => patch(b.id, { durationMinutes: Math.max(0, v) })} />
              </div>
              <div className="w-48">
                <BreakTimeField value={b.startTime} onChange={(v) => patch(b.id, { startTime: v })} />
              </div>
              <div className="flex flex-col gap-2">
                <span className={Typography.label}>{t('views.JobScheduling.BreakEditorModal.labelPaid')}</span>
                <div className="h-[52px] flex items-center"><Toggle checked={b.paid} onChange={(v) => patch(b.id, { paid: v })} /></div>
              </div>
              <button onClick={() => remove(b.id)} aria-label={t('views.JobScheduling.BreakEditorModal.removeBreak')} className="p-2 text-gray-400 hover:text-red-600 rounded-lg mb-1"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <Button onClick={add} variant="secondary"><Plus className="w-4 h-4 mr-2" /> {t('views.JobScheduling.BreakEditorModal.addBreak')}</Button>
        </div>

        <div className="flex items-center justify-between gap-3 p-5 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onResetToDefault} className="text-sm font-semibold text-gray-500 hover:text-primary-600">{t('views.JobScheduling.BreakEditorModal.resetToDefault')}</button>
          <div className="flex gap-2">
            <Button onClick={onClose} variant="secondary">{t('views.JobScheduling.BreakEditorModal.cancel')}</Button>
            <Button onClick={() => onSave(draft)}>{t('views.JobScheduling.BreakEditorModal.save')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
};
