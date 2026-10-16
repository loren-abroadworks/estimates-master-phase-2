
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, Button } from '../UI';
import { useTranslation } from '../../i18n/LanguageContext';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  closeOnConfirm?: boolean;
  variant?: 'danger' | 'primary';
}

export const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  closeOnConfirm = true,
  variant = 'danger'
}: ConfirmationModalProps) => {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('modals.ConfirmationModal.confirmAction');
  const resolvedMessage = message ?? t('modals.ConfirmationModal.areYouSure');
  const resolvedConfirmLabel = confirmLabel ?? t('modals.ConfirmationModal.delete');
  const resolvedCancelLabel = cancelLabel ?? t('modals.ConfirmationModal.cancel');

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={resolvedTitle} maxWidth="max-w-md">
      <div className="flex flex-col items-center text-center p-4">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${variant === 'primary' ? 'bg-primary-50 dark:bg-primary-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          <AlertTriangle className={`w-8 h-8 ${variant === 'primary' ? 'text-primary-500' : 'text-red-500 dark:text-red-400'}`} />
        </div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{resolvedTitle}</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
          {resolvedMessage}
        </p>
        <div className="flex gap-3 w-full">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            {resolvedCancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={() => {
              onConfirm();
              if (closeOnConfirm) onClose();
            }}
            className={`flex-1 ${variant === 'danger' ? 'shadow-lg shadow-red-500/20' : 'shadow-lg shadow-primary-500/20'}`}
          >
            {resolvedConfirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
