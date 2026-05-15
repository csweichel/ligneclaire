import type { ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ligneclaire/ui";
import { cn } from "@ligneclaire/ui";
import { Eyebrow } from "./StudioPrimitives";

type StudioModalFrameProps = Readonly<{
  bodyClassName?: string;
  children: ReactNode;
  eyebrow?: string;
  onClose: () => void;
  surfaceClassName?: string;
  title: string;
}>;

export function StudioModalFrame({
  bodyClassName,
  children,
  eyebrow,
  onClose,
  surfaceClassName,
  title,
}: StudioModalFrameProps) {
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        className={cn(
          "grid h-[94vh] w-[min(94vw,1180px)] grid-rows-[auto_minmax(0,1fr)]",
          surfaceClassName === "studio-modal__surface--panel" &&
            "h-auto w-[min(760px,calc(100vw-24px))] max-h-[94vh]",
          surfaceClassName
        )}
      >
        <DialogHeader className="flex-row items-start justify-between gap-4">
          <div className="grid gap-2">
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
          </div>

          <Button
            aria-label={`Close ${title}`}
            size="sm"
            variant="secondary"
            onClick={onClose}
          >
            Close
          </Button>
        </DialogHeader>

        <div className={cn("min-h-0 overflow-hidden px-6 pb-6", bodyClassName)}>{children}</div>
      </DialogContent>
    </Dialog>
  );
}
