import * as AccordionPrimitive from "@radix-ui/react-accordion";
import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";
import { cn } from "../lib/utils";

const Accordion = AccordionPrimitive.Root;

const AccordionItem = forwardRef<
  ElementRef<typeof AccordionPrimitive.Item>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(function AccordionItem({ className, ...props }, ref) {
  return (
    <AccordionPrimitive.Item
      ref={ref}
      className={cn("overflow-hidden rounded-lc-control border border-lc-border bg-lc-panel", className)}
      {...props}
    />
  );
});

const AccordionTrigger = forwardRef<
  ElementRef<typeof AccordionPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(function AccordionTrigger({ children, className, ...props }, ref) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          "flex flex-1 items-center justify-between gap-4 px-4 py-3 text-left font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-lc-text-secondary transition hover:bg-lc-panel-hover [&[data-state=open]>span:last-child]:rotate-180",
          className
        )}
        {...props}
      >
        {children}
        <span aria-hidden="true" className="text-lc-text-muted transition-transform duration-200">
          ▾
        </span>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
});

const AccordionContent = forwardRef<
  ElementRef<typeof AccordionPrimitive.Content>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AccordionContent({ className, ...props }, ref) {
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className={cn(
        "overflow-hidden data-[state=closed]:animate-out data-[state=open]:animate-in",
        className
      )}
      {...props}
    />
  );
});

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
