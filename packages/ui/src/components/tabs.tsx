import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";
import { cn } from "../lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex h-11 items-center rounded-full border border-slate-200/80 bg-white/80 p-1 shadow-sm shadow-slate-900/5",
        className
      )}
      {...props}
    />
  );
});

const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex min-w-[7rem] items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-slate-500 transition data-[state=active]:bg-slate-950 data-[state=active]:text-white data-[state=active]:shadow-sm disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});

const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return <TabsPrimitive.Content ref={ref} className={cn("outline-none", className)} {...props} />;
});

export { Tabs, TabsList, TabsTrigger, TabsContent };
