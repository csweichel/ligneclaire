import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lc-control border text-sm font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lc-primary/20",
  {
    variants: {
      variant: {
        default:
          "border-lc-primary bg-lc-primary text-lc-on-primary hover:border-lc-primary-hover hover:bg-lc-primary-hover",
        secondary:
          "border-lc-border bg-lc-panel text-lc-text hover:bg-lc-panel-hover",
        outline:
          "border-lc-border bg-lc-panel-subtle text-lc-text hover:bg-lc-panel",
        ghost: "border-transparent bg-transparent text-lc-text-secondary hover:bg-lc-panel-subtle hover:text-lc-text",
        destructive:
          "border-lc-danger bg-lc-danger text-lc-on-primary hover:border-lc-danger-hover hover:bg-lc-danger-hover",
        soft: "border-lc-primary-soft bg-lc-primary-soft text-lc-primary-ink hover:bg-lc-primary-soft-hover",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-5 text-base",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> &
  Readonly<{
    asChild?: boolean;
  }>;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    asChild = false,
    className,
    size,
    variant,
    type = "button",
    ...props
  },
  ref
) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ size, variant }), className)}
      type={asChild ? undefined : type}
      {...props}
    />
  );
});

export { Button, buttonVariants };
export type { ButtonProps };
