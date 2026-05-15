import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/10",
  {
    variants: {
      variant: {
        default:
          "bg-indigo-600 text-white shadow-sm shadow-indigo-950/15 hover:bg-indigo-700",
        secondary:
          "bg-white/90 text-slate-900 ring-1 ring-slate-200/80 shadow-sm shadow-slate-900/5 hover:bg-white",
        outline:
          "border border-slate-300/80 bg-white/70 text-slate-700 hover:bg-white",
        ghost: "text-slate-700 hover:bg-slate-100/80",
        destructive:
          "bg-rose-600 text-white shadow-sm shadow-rose-950/15 hover:bg-rose-700",
        soft: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-2xl px-5 text-base",
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
