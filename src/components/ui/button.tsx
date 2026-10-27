import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--belvia-rose)] text-white shadow-sm hover:bg-[var(--belvia-rose-dark)] focus-visible:ring-[var(--belvia-rose)]',
        destructive:
          'bg-red-500 text-white shadow-sm hover:bg-red-600',
        outline:
          'border border-[var(--belvia-border)] bg-white text-[var(--belvia-text)] shadow-sm hover:bg-[var(--belvia-nude)] hover:border-[var(--belvia-rose)]',
        secondary:
          'bg-[var(--belvia-nude)] text-[var(--belvia-text)] shadow-sm hover:bg-[var(--belvia-rose-light)]',
        ghost:
          'hover:bg-[var(--belvia-nude)] text-[var(--belvia-text)]',
        link:
          'text-[var(--belvia-rose)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-lg px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
