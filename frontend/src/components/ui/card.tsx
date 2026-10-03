import * as React from 'react';
import { cn } from '../../lib/utils';

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: 'default' | 'surface-2' | 'spotlight-violet' | 'spotlight-magenta' | 'spotlight-orange' | 'spotlight-coral';
  }
>(({ className, variant = 'default', ...props }, ref) => {
  const variantStyles = {
    default: 'bg-surface-1 border-hairline',
    'surface-2': 'bg-surface-2 border-hairline',
    'spotlight-violet':
      'bg-gradient-to-br from-purple-900/35 via-surface-1 to-canvas border-purple-500/25 shadow-2xl shadow-purple-950/20 rounded-2xl',
    'spotlight-magenta':
      'bg-gradient-to-br from-pink-900/35 via-surface-1 to-canvas border-pink-500/25 shadow-2xl shadow-pink-950/20 rounded-2xl',
    'spotlight-orange':
      'bg-gradient-to-br from-amber-900/30 via-surface-1 to-canvas border-amber-500/25 shadow-2xl shadow-amber-950/20 rounded-2xl',
    'spotlight-coral':
      'bg-gradient-to-br from-rose-900/35 via-surface-1 to-canvas border-rose-500/25 shadow-2xl shadow-rose-950/20 rounded-2xl',
  };

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border text-ink shadow-sm transition-all',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
});
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight text-ink',
      className
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-xs text-ink-muted leading-relaxed', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
