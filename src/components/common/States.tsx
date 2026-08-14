import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 py-16 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function CardSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      <Inbox className="h-7 w-7 text-muted-foreground" aria-hidden />
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-14 text-center">
      <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
      <h3 className="text-base font-semibold text-foreground">Something went wrong</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        {message ?? "We couldn't load this data. Please try again."}
      </p>
      {onRetry ? (
        <Button variant="outline" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}