import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent-blue/40 select-none border',
  {
    variants: {
      variant: {
        default:
          'border-hairline bg-surface-1 text-ink',
        secondary:
          'border-hairline bg-surface-2 text-ink-muted',
        success:
          'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
        warning:
          'border-amber-500/20 bg-amber-500/10 text-amber-400',
        destructive:
          'border-rose-500/20 bg-rose-500/10 text-rose-400',
        accent:
          'border-accent-blue/30 bg-accent-blue/15 text-accent-blue',
        outline:
          'border-hairline text-ink-muted',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
