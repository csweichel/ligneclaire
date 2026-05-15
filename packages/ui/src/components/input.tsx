import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full min-w-0 rounded-lc-control border border-lc-border bg-lc-panel px-3 py-2 text-sm text-lc-text shadow-lc-recessed transition-colors placeholder:text-lc-text-muted focus-visible:border-lc-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lc-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});

export { Input };
export type { InputProps };
