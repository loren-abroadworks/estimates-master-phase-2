'use client';

/*
  Modal and ConfirmDialog, built on Radix Dialog.
  <Modal open onOpenChange title="Add Lead" footer={<Button>Save</Button>}>…</Modal>
*/
import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const SIZES = { sm: 'md:max-w-md', md: 'md:max-w-lg', lg: 'md:max-w-2xl', xl: 'md:max-w-4xl', full: 'md:max-w-6xl' } as const;

export function Modal({
  open, onOpenChange, title, description, children, footer, size = 'md', className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-gray-900/50 backdrop-blur-sm animate-in-fade" />
        <Dialog.Content
          className={cn(
            // Phase-1 modal: bottom sheet on phones, centered card from md up.
            'fixed inset-x-0 bottom-0 z-[101] w-full max-h-[95vh] md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[calc(100vw-2rem)] md:-translate-x-1/2 md:-translate-y-1/2',
            'md:max-h-[90vh] flex flex-col overflow-hidden rounded-t-3xl md:rounded-3xl bg-white shadow-2xl border border-gray-100 focus:outline-none',
            SIZES[size],
            className,
          )}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-gray-100 bg-white px-6 py-5 md:px-8 md:py-6">
            <div>
              <Dialog.Title className="font-heading text-xl font-bold leading-snug text-gray-900 md:text-2xl">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-gray-500">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
              <X className="h-6 w-6" />
            </Dialog.Close>
          </div>
          <div className="custom-scrollbar flex-1 overflow-y-auto p-6 md:p-8">{children}</div>
          {footer && <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/60 px-6 py-4 md:px-8">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open, onOpenChange, title = 'Are you sure?', message, confirmLabel = 'Delete', onConfirm, variant = 'danger',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  variant?: 'danger' | 'primary';
}) {
  // Phase-1 ConfirmationModal: centered icon, title, message, then Cancel and Confirm side by side.
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" title={title}>
      <div className="flex flex-col items-center p-4 text-center">
        <div className={cn('mb-4 flex h-16 w-16 items-center justify-center rounded-full', variant === 'primary' ? 'bg-primary-50' : 'bg-red-50')}>
          <AlertTriangle className={cn('h-8 w-8', variant === 'primary' ? 'text-primary-500' : 'text-red-500')} />
        </div>
        <h3 className="mb-2 text-xl font-bold text-gray-900">{title}</h3>
        <div className="mb-8 leading-relaxed text-gray-500">{message ?? 'This action cannot be undone.'}</div>
        <div className="flex w-full gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={variant}
            className={cn('flex-1 shadow-lg', variant === 'danger' ? 'shadow-red-500/20' : 'shadow-primary-500/20')}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
