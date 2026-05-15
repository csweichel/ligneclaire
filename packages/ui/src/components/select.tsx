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
          "flex h-10 w-full min-w-0 appearance-none rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 pr-9 text-sm text-slate-900 shadow-sm shadow-slate-900/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400"
      >
        ▾
      </span>
    </div>
  );
});

export { Select };
export type { SelectProps };
