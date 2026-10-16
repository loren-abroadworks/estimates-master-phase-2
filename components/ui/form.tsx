'use client';

/*
  Form controls: Label, Field (label + hint + error wrapper), Input,
  Textarea, NativeSelect, Select (Radix), Switch, Checkbox.
  The live app uses small uppercase labels ("BASE LABOR RATE ($/HR)") and
  inputs with a clear (x) button.
*/
import React from 'react';
import * as RSelect from '@radix-ui/react-select';
import * as RSwitch from '@radix-ui/react-switch';
import * as RCheckbox from '@radix-ui/react-checkbox';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Label({ children, required, className, htmlFor }: { children: React.ReactNode; required?: boolean; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2', className)}>
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

export function Field({
  label, required, hint, error, children, className,
}: { label?: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  // Tie the label to a single input, textarea or select child, so clicking the
  // label focuses it and screen readers announce the label as its name.
  const autoId = React.useId();
  const child = React.Children.count(children) === 1 && React.isValidElement<{ id?: string }>(children) && LABELLABLE.has(children.type) ? children : null;
  const id = child ? child.props.id ?? autoId : undefined;
  return (
    <div className={className}>
      {label && <Label required={required} htmlFor={id}>{label}</Label>}
      {child && !child.props.id ? React.cloneElement(child, { id }) : children}
      {error ? <p className="ml-3 mt-1 text-sm text-red-600">{error}</p> : hint ? <p className="ml-3 mt-1 text-sm text-gray-500">{hint}</p> : null}
    </div>
  );
}

// Production input (packages/ui/src/input, size sm): 48px, 0.63rem corners, gray-300 border, primary focus ring.
const inputBase =
  'w-full h-12 rounded-[0.63rem] border bg-white px-3 text-sm font-medium text-gray-600 placeholder:font-normal placeholder:text-gray-400 transition-all duration-200 outline-none ' +
  'focus:ring-4 focus:ring-primary-100 focus:border-primary-400 disabled:cursor-not-allowed disabled:opacity-50';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Shows an (x) that clears the value, like the live settings forms */
  onClear?: () => void;
  leftIcon?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, onClear, leftIcon, suffix, ...rest },
  ref,
) {
  const hasValue = rest.value !== undefined && rest.value !== '' && rest.value !== null;
  return (
    <div className="relative">
      {leftIcon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{leftIcon}</span>}
      <input
        ref={ref}
        className={cn(
          inputBase,
          invalid ? 'border-red-600 focus:ring-red-100 focus:border-red-600' : 'border-gray-300',
          leftIcon && 'pl-[2.375rem]',
          (onClear || suffix) && 'pr-9',
          className,
        )}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {onClear && hasValue && !rest.disabled && (
        <button type="button" onClick={onClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700" aria-label="Clear">
          <X className="w-4 h-4" />
        </button>
      )}
      {suffix && !onClear && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{suffix}</span>}
    </div>
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(inputBase, 'h-auto min-h-[96px] py-3', invalid ? 'border-red-600' : 'border-gray-300', className)}
        {...rest}
      />
    );
  },
);

/** Plain <select>, handy inside tables where a popover would be clumsy. */
export function NativeSelect({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputBase, 'border-gray-300 appearance-none cursor-pointer pr-9 hover:bg-gray-50', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

/** Radix select. Pass options and value; onChange gets the new value. */
export function Select({
  value, onChange, options, placeholder = 'Select…', className, icon, disabled, invalid, size = 'md', ariaLabel, id,
}: {
  id?: string;
  /** Accessible name when no visible label is tied to the select. */
  ariaLabel?: string;
  value?: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <RSelect.Root value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <RSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          // Production Select.Form trigger (packages/ui/src/select/form).
          'inline-flex w-full items-center justify-between gap-2 border bg-white px-3 text-sm font-medium text-gray-600 transition-all hover:bg-gray-50',
          'outline-none focus:ring-4 focus:ring-primary-100 focus:border-primary-400 data-[placeholder]:font-normal data-[placeholder]:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50',
          invalid ? 'border-red-600' : 'border-gray-300',
          size === 'sm' ? 'h-9 rounded-lg' : 'h-12 rounded-[0.625rem]',
          className,
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {icon}
          <RSelect.Value placeholder={placeholder} />
        </span>
        <RSelect.Icon>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content position="popper" sideOffset={4} className="z-[200] min-w-[var(--radix-select-trigger-width)] max-h-72 overflow-hidden rounded-[0.625rem] border border-gray-200 bg-white shadow-xl">
          <RSelect.Viewport className="p-1">
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center rounded-lg py-3 pl-8 pr-4 text-sm text-gray-700 outline-none data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-800"
              >
                <RSelect.ItemIndicator className="absolute left-2">
                  <Check className="w-4 h-4 text-primary-600" />
                </RSelect.ItemIndicator>
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <RSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="relative inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent bg-gray-200 shadow-xs transition-all data-[state=checked]:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RSwitch.Thumb className="block size-4 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0" />
    </RSwitch.Root>
  );
}

export function Checkbox({ checked, onChange, disabled, label, id, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: React.ReactNode; id?: string; ariaLabel?: string }) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-sm text-gray-700', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <RCheckbox.Root
        id={id}
        aria-label={ariaLabel}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
        className="flex h-4 w-4 items-center justify-center rounded border border-gray-300 bg-white data-[state=checked]:border-primary-600 data-[state=checked]:bg-primary-600"
      >
        <RCheckbox.Indicator>
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      {label}
    </label>
  );
}

/** Form controls that Field links to its label (see Field). */
const LABELLABLE = new Set<unknown>([Input, Textarea, NativeSelect, Select]);
