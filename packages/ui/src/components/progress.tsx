import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils";

type ProgressProps = HTMLAttributes<HTMLDivElement> &
  Readonly<{
    value?: number;
  }>;

function Progress({ className, value = 0, ...props }: ProgressProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn("h-2 overflow-hidden rounded-full bg-slate-200/80", className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-indigo-600 transition-all duration-300"
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
}

export { Progress };
export type { ProgressProps };
