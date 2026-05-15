import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../lib/utils";

const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lc-control border border-lc-border bg-lc-panel shadow-none",
        className
      )}
      {...props}
    />
  );
});

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardHeader(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={cn("flex flex-col gap-2 p-6", className)} {...props} />;
});

const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn(
          "text-lg font-semibold text-lc-text",
          className
        )}
        {...props}
      />
    );
  }
);

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cn("text-sm leading-6 text-lc-text-secondary", className)} {...props} />;
  }
);

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn("px-6 pb-6", className)} {...props} />;
  }
);

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardFooter(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={cn("flex items-center gap-3 px-6 pb-6", className)} {...props} />;
});

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
