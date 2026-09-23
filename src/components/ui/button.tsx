import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Button primitive. Variants are expressed with semantic tokens only (no hex).
 * Radius 8px per the design system; motion 180ms ease-out.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover border border-transparent',
  secondary: 'bg-elevated text-text border border-border-strong hover:border-primary',
  ghost: 'bg-transparent text-text-secondary hover:text-text hover:bg-elevated border border-transparent',
  danger: 'bg-transparent text-error border border-error/50 hover:bg-error/10',
  success: 'bg-success text-primary-fg hover:opacity-90 border border-transparent',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-meta-lg gap-1.5',
  md: 'h-9 px-4 text-body gap-2',
  lg: 'h-11 px-5 text-body-lg gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded font-medium transition-colors duration-200 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
