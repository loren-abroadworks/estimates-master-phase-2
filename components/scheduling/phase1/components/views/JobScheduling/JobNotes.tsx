import React, { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import type { JobNote } from '../../../types';
import { Button } from '../../UI';
import { useTranslation } from '../../../i18n/LanguageContext';

// Unique-enough id for a client-side note.
const newNoteId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `note-${Date.now()}-${Math.round(Math.random() * 1e6)}`);

const fmtStamp = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

interface JobNotesProps {
  notes: JobNote[];
  onChange: (notes: JobNote[]) => void;
  /** Restricts height of the list and stretches to fill (used in the docked drawer). */
  fill?: boolean;
}

/** Add-and-list notes editor. Newest note first. */
export const JobNotes = ({ notes, onChange, fill }: JobNotesProps) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const list = [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...notes, { id: newNoteId(), text, createdAt: new Date().toISOString() }]);
    setDraft('');
  };

  const remove = (id: string) => onChange(notes.filter(n => n.id !== id));

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Composer */}
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add(); }}
          placeholder={t('views.JobScheduling.JobNotes.addNotePlaceholder')}
          rows={3}
          className="w-full rounded-xl border border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-800 p-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
        />
        <div className="flex justify-end">
          <Button onClick={add} disabled={!draft.trim()} size="sm" className="justify-center">
            <Plus className="w-4 h-4 mr-1" /> {t('views.JobScheduling.JobNotes.addNote')}
          </Button>
        </div>
      </div>

      {/* List */}
      {list.length > 0 ? (
        <div className={`space-y-2 ${fill ? 'flex-1 overflow-y-auto' : ''}`}>
          {list.map(n => (
            <div key={n.id} className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-line break-words min-w-0">{n.text}</p>
                <button
                  onClick={() => remove(n.id)}
                  aria-label={t('views.JobScheduling.JobNotes.deleteNote')}
                  className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {n.createdAt && <div className="mt-1.5 text-[11px] font-medium text-gray-400">{fmtStamp(n.createdAt)}{n.author ? ` · ${n.author}` : ''}</div>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-6">{t('views.JobScheduling.JobNotes.noNotesYet')}</p>
      )}
    </div>
  );
};
