import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";
import { cn } from "../lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-lc-text/28 data-[state=closed]:animate-out data-[state=open]:animate-in",
        className
      )}
      {...props}
    />
  );
});

const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(function DialogContent({ className, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid w-[min(94vw,1100px)] max-h-[94vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lc-shell border border-lc-border bg-lc-panel focus:outline-none",
          className
        )}
        {...props}
      />
    </DialogPortal>
  );
});

const DialogHeader = ({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) => (
    <div
    className={cn("flex flex-col gap-2 border-b border-lc-border px-6 py-5", className)}
    {...props}
  />
);

const DialogFooter = ({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) => (
    <div
      className={cn(
      "flex flex-col-reverse gap-3 border-t border-lc-border px-6 py-5 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
);

const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
        ref={ref}
        className={cn(
        "text-2xl font-semibold text-lc-text",
        className
      )}
      {...props}
    />
  );
});

const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return <DialogPrimitive.Description ref={ref} className={cn("text-sm leading-6 text-lc-text-secondary", className)} {...props} />;
});

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
