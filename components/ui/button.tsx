'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
  Button styles from production (packages/ui/src/button, see docs/BRANDING.md):
  - primary: solid royal blue, soft blue glow on hover ("Create New Estimate")
  - secondary: white with gray border ("View Archived", "Customize")
  - danger: soft red tint for destructive actions (confirm dialogs)
  - danger-outline: white with red border
  - outline: 2px blue border
  - dark: near-black (active filter pill on Jobs)
  - ghost: no border, gray text (icon buttons, kebab menus)
*/
const VARIANTS = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm border border-transparent hover:shadow-primary-500/20',
  secondary: 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 hover:border-gray-300 shadow-sm',
  outline: 'bg-transparent text-gray-900 hover:bg-primary-50 border-2 border-primary-600',
  danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 hover:border-red-200',
  'danger-outline': 'bg-white text-red-600 hover:bg-red-50 border border-red-200',
  dark: 'bg-gray-900 text-white hover:bg-gray-800 border border-gray-900',
  ghost: 'bg-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100 border border-transparent',
  success: 'bg-green-600 text-white hover:bg-green-700 border border-green-600',
} as const;

const SIZES = {
  xs: 'px-2.5 py-1 text-xs gap-1 rounded-md',
  sm: 'px-3 py-1.5 text-sm gap-2 rounded-md',
  md: 'px-5 py-2.5 text-sm md:text-base gap-2 rounded-md',
  lg: 'px-6 py-3.5 text-base md:text-lg font-bold gap-2 rounded-md',
  icon: 'h-9 w-9 justify-center rounded-md',
  'icon-sm': 'h-7 w-7 justify-center rounded-md',
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium whitespace-nowrap transition-all duration-200 active:scale-95',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});
