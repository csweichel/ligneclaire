import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "../lib/utils";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { children, className, ...props },
  ref
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "flex h-10 w-full min-w-0 appearance-none rounded-lc-control border border-lc-border bg-lc-panel px-3 py-2 pr-9 text-sm text-lc-text shadow-lc-recessed transition-colors focus-visible:border-lc-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lc-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-lc-text-muted"
      >
        ▾
      </span>
    </div>
  );
});

export { Select };
export type { SelectProps };
