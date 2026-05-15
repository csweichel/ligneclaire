import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-lc-control border px-2.5 py-1 font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em]",
  {
    variants: {
      variant: {
        default: "border-lc-border bg-lc-panel-subtle text-lc-text-secondary",
        accent: "border-lc-primary-soft bg-lc-primary-soft text-lc-primary-ink",
        success: "border-lc-success-soft bg-lc-success-soft text-lc-success",
        warning: "border-lc-warning-soft bg-lc-warning-soft text-lc-warning",
        destructive: "border-lc-danger-soft bg-lc-danger-soft text-lc-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

type BadgeProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
export type { BadgeProps };
