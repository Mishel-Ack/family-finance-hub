import { STATUS_META, statusFor } from "@/lib/calculations";
import { cn } from "@/lib/utils";

export function BudgetProgress({ percent, className }: { percent: number; className?: string }) {
  const status = statusFor(percent);
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-all", STATUS_META[status].bar)}
        style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}