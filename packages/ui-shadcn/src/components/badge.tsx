import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '../cn.js';

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger';
}

const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'border-transparent bg-slate-900 text-slate-50 dark:bg-slate-50 dark:text-slate-900',
  secondary: 'border-transparent bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50',
  outline: 'text-slate-900 dark:text-slate-50',
  success: 'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200',
  warning: 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  danger: 'border-transparent bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200',
};

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(function Badge(
  { className, variant = 'default', ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
});
