import type { HTMLAttributes, ReactNode } from "react";
import { Card, cn } from "@ligneclaire/ui";

type EyebrowProps = Readonly<{
  children: ReactNode;
  className?: string;
}>;

type FieldProps = Readonly<{
  children: ReactNode;
  className?: string;
  hint?: ReactNode;
  label: ReactNode;
}>;

type InlineFieldProps = Readonly<{
  children: ReactNode;
  className?: string;
  label: ReactNode;
}>;

type InfoRowProps = Readonly<{
  className?: string;
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
}>;

type NoticeProps = HTMLAttributes<HTMLDivElement> &
  Readonly<{
    tone?: "default" | "info" | "warning" | "destructive";
  }>;

function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <p
      className={cn(
        "font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-lc-text-secondary",
        className
      )}
    >
      {children}
    </p>
  );
}

function Field({ children, className, hint, label }: FieldProps) {
  return (
    <label className={cn("grid gap-2", className)}>
      <span className="font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-lc-text-secondary">
        {label}
      </span>
      {children}
      {hint ? <span className="text-sm leading-6 text-lc-text-secondary">{hint}</span> : null}
    </label>
  );
}

function InlineField({ children, className, label }: InlineFieldProps) {
  return (
    <label className={cn("flex items-center gap-3 max-md:flex-col max-md:items-stretch", className)}>
      <span className="shrink-0 font-lc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-lc-text-secondary">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}

function InfoRow({ className, label, value, valueClassName }: InfoRowProps) {
  return (
    <div className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-4 text-sm", className)}>
      <span className="text-lc-text-secondary">{label}</span>
      <span className={cn("break-words text-right font-medium text-lc-text", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

function EmptyState({ children, className }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lc-control border border-dashed border-lc-border bg-lc-panel-subtle px-4 py-4 text-sm leading-6 text-lc-text-secondary",
        className
      )}
    >
      {children}
    </div>
  );
}

function Notice({
  className,
  tone = "default",
  ...props
}: NoticeProps) {
  return (
    <div
      className={cn(
        "rounded-lc-control border px-4 py-3 text-sm leading-6",
        tone === "default" && "border-lc-border bg-lc-panel-subtle text-lc-text-secondary",
        tone === "info" && "border-lc-primary-soft bg-lc-primary-soft text-lc-primary-ink",
        tone === "warning" && "border-lc-warning-soft bg-lc-warning-soft text-lc-warning",
        tone === "destructive" && "border-lc-danger-soft bg-lc-danger-soft text-lc-danger",
        className
      )}
      {...props}
    />
  );
}

function PanelCard({
  children,
  className,
  contentClassName,
  ...props
}: HTMLAttributes<HTMLDivElement> & Readonly<{ contentClassName?: string }>) {
  return (
    <Card
      className={cn(
        "rounded-lc-control border-lc-border bg-lc-panel shadow-none",
        className
      )}
      {...props}
    >
      <div className={cn("grid gap-4 p-5", contentClassName)}>{children}</div>
    </Card>
  );
}

function CodeBlock({ children, className }: HTMLAttributes<HTMLPreElement>) {
  return (
    <pre
      className={cn(
        "overflow-auto rounded-lc-control border border-lc-console-border bg-lc-console p-3 font-lc-mono text-xs leading-6 text-lc-console-text",
        className
      )}
    >
      {children}
    </pre>
  );
}

export { CodeBlock, EmptyState, Eyebrow, Field, InfoRow, InlineField, Notice, PanelCard };
