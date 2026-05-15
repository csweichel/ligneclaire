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
        "text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500",
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
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      {children}
      {hint ? <span className="text-sm leading-6 text-slate-500">{hint}</span> : null}
    </label>
  );
}

function InlineField({ children, className, label }: InlineFieldProps) {
  return (
    <label className={cn("flex items-center gap-3 max-md:flex-col max-md:items-stretch", className)}>
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}

function InfoRow({ className, label, value, valueClassName }: InfoRowProps) {
  return (
    <div className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-4 text-sm", className)}>
      <span className="text-slate-500">{label}</span>
      <span className={cn("text-right font-medium text-slate-900 break-words", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

function EmptyState({ children, className }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-500",
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
        "rounded-2xl border px-4 py-3 text-sm leading-6",
        tone === "default" &&
          "border-slate-200/80 bg-slate-50/80 text-slate-600",
        tone === "info" && "border-sky-200 bg-sky-50 text-sky-700",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
        tone === "destructive" && "border-rose-200 bg-rose-50 text-rose-700",
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
        "rounded-[26px] border-slate-200/80 bg-white/88 shadow-[0_24px_72px_-52px_rgba(15,23,42,0.45)]",
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
        'overflow-auto rounded-2xl border border-rose-200 bg-rose-50/70 p-3 font-["SFMono-Regular","SFMono","Cascadia_Code","Roboto_Mono",monospace] text-xs leading-6 text-slate-700',
        className
      )}
    >
      {children}
    </pre>
  );
}

export { CodeBlock, EmptyState, Eyebrow, Field, InfoRow, InlineField, Notice, PanelCard };
