import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../lib/utils";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-24 w-full min-w-0 rounded-lc-control border border-lc-border bg-lc-panel px-3 py-2 text-sm text-lc-text shadow-lc-recessed transition-colors placeholder:text-lc-text-muted focus-visible:border-lc-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lc-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});

export { Textarea };
export type { TextareaProps };
