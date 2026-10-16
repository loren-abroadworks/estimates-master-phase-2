import { Children, cloneElement, forwardRef, isValidElement, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Check } from "lucide-react";
import { cn } from "@/features/lib/cn";

// Production brand rules (docs/BRANDING.md): 0.63rem corners, gray-300 border, primary-100 focus ring.
// Heights stay compact on feature screens (dense tables and side panels).
const base =
  "w-full rounded-[0.63rem] border bg-white px-3 text-sm font-medium text-gray-600 placeholder:font-normal placeholder:text-gray-400 transition-all duration-200 " +
  "focus:outline-none focus:ring-4 focus:ring-primary-100 focus:border-primary-400 disabled:cursor-not-allowed disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(base, "h-10", invalid ? "border-red-600" : "border-gray-300", className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(base, "min-h-20 py-2", invalid ? "border-red-600" : "border-gray-300", className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(base, "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22><path d=%22m4 6 4 4 4-4%22/></svg>')] bg-[right_10px_center] bg-no-repeat pr-8", invalid ? "border-red-600" : "border-gray-300", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
});

/** Label + control + hint/error. */
/** Form controls that Field links to its label (see Field). */
const LABELLABLE = new Set<unknown>([Input, Textarea, Select]);

export function Field({ label, htmlFor, required, error, hint, children, className }: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  // With no htmlFor, tie the label to a single Input, Select or Textarea child, so
  // clicking the label focuses it and screen readers announce the label as its name.
  const autoId = useId();
  const child = !htmlFor && Children.count(children) === 1 && isValidElement<{ id?: string }>(children) && LABELLABLE.has(children.type) ? children : null;
  const id = htmlFor ?? (child ? child.props.id ?? autoId : undefined);
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-gray-500">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {child && !child.props.id ? cloneElement(child, { id }) : children}
      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ checked, onCheckedChange, disabled, id, label }: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
  label?: ReactNode;
}) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
      <CheckboxPrimitive.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-300 bg-white data-[state=checked]:border-brand data-[state=checked]:bg-brand"
      >
        <CheckboxPrimitive.Indicator>
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label}
    </label>
  );
}

export function Switch({ checked, onCheckedChange, disabled, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; label?: ReactNode }) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm", disabled && "opacity-50")}>
      <SwitchPrimitive.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="relative inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent bg-gray-200 shadow-xs transition-all data-[state=checked]:bg-primary-700"
      >
        <SwitchPrimitive.Thumb className="block size-4 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0" />
      </SwitchPrimitive.Root>
      {label}
    </label>
  );
}
