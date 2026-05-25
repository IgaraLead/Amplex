import * as React from 'react';

import { cn } from '@/lib/utils';

function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: React.ComponentProps<'progress'> & {
  indicatorClassName?: string;
}) {
  return (
    <progress
      data-slot="progress"
      className={cn(
        'h-2 w-full overflow-hidden rounded-full accent-primary [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-primary/20 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary',
        indicatorClassName,
        className
      )}
      max={100}
      value={value ?? 0}
      {...props}
    />
  );
}

export { Progress };
