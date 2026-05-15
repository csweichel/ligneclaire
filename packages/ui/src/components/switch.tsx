import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";
import { cn } from "../lib/utils";

const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-lc-border-strong transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lc-primary/20 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-lc-primary",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 translate-x-0.5 rounded-full border border-lc-border bg-lc-panel transition-transform data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  );
});

export { Switch };
