import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeftRight,
  Banknote,
  ClipboardList,
  FolderClosed,
  ReceiptIndianRupee,
  UserMinus,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { fromPaise } from "@/lib/money";
import { formatINR } from "@/lib/format";
import type { ActivityItem } from "@/lib/activity-queries";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const icons: Record<ActivityItem["type"], LucideIcon> = {
  EXPENSE_CREATED: ReceiptIndianRupee,
  EXPENSE_UPDATED: ReceiptIndianRupee,
  EXPENSE_DELETED: ReceiptIndianRupee,
  BUDGET_UPSERTED: Banknote,
  BUDGET_DELETED: Banknote,
  CATEGORY_CREATED: FolderClosed,
  CATEGORY_UPDATED: FolderClosed,
  CATEGORY_ARCHIVED: FolderClosed,
  MEMBER_JOINED: UserPlus,
  MEMBER_LEFT: UserMinus,
  MEMBER_REMOVED: UserMinus,
  MEMBER_ROLE_CHANGED: Users,
  OWNERSHIP_TRANSFERRED: ArrowLeftRight,
  INVITE_CREATED: ClipboardList,
  INVITE_REVOKED: ClipboardList,
  SPLIT_CREATED: ReceiptIndianRupee,
  SPLIT_REMOVED: ReceiptIndianRupee,
  SETTLEMENT_RECORDED: Banknote,
  SETTLEMENT_DELETED: Banknote,
};

function sentence(item: ActivityItem): string {
  switch (item.type) {
    case "EXPENSE_CREATED":
      return `${item.actorName} added ${formatINR(fromPaise(item.summary.amountPaise))} to ${item.summary.categoryName}${item.summary.description ? ` (${item.summary.description})` : ""}`;
    case "EXPENSE_UPDATED":
      return `${item.actorName} updated a ${item.summary.categoryName} expense to ${formatINR(fromPaise(item.summary.amountPaise))}`;
    case "EXPENSE_DELETED":
      return `${item.actorName} removed a ${item.summary.categoryName} expense (${formatINR(fromPaise(item.summary.amountPaise))})`;
    case "BUDGET_UPSERTED":
      if (item.summary.operation === "TOTAL_LIMIT_SET")
        return `${item.actorName} set the ${item.summary.month}/${item.summary.year} budget to ${formatINR(fromPaise(item.summary.totalLimitPaise))}`;
      if (item.summary.operation === "CATEGORY_LIMIT_SET")
        return `${item.actorName} set the ${item.summary.categoryName} limit to ${formatINR(fromPaise(item.summary.limitPaise))}`;
      return `${item.actorName} removed the ${item.summary.categoryName} budget limit`;
    case "BUDGET_DELETED":
      return `${item.actorName} deleted the ${item.summary.month}/${item.summary.year} budget`;
    case "CATEGORY_CREATED":
      return `${item.actorName} added the ${item.summary.categoryName} category`;
    case "CATEGORY_UPDATED":
      return `${item.actorName} updated the ${item.summary.categoryName} category`;
    case "CATEGORY_ARCHIVED":
      return `${item.actorName} archived the ${item.summary.categoryName} category`;
    case "MEMBER_JOINED":
      return `${item.summary.displayName} joined the family`;
    case "MEMBER_LEFT":
      return `${item.summary.displayName} left the family`;
    case "MEMBER_REMOVED":
      return `${item.summary.displayName} was removed from the family`;
    case "MEMBER_ROLE_CHANGED":
      return `${item.actorName} changed ${item.summary.displayName}'s role from ${item.summary.oldRole} to ${item.summary.newRole}`;
    case "OWNERSHIP_TRANSFERRED":
      return `${item.summary.oldOwnerName} transferred ownership to ${item.summary.newOwnerName}`;
    case "INVITE_CREATED":
      return `${item.actorName} created a ${item.summary.role} invite`;
    case "INVITE_REVOKED":
      return `${item.actorName} revoked a ${item.summary.role} invite`;
    case "SPLIT_CREATED":
      return `${item.actorName} created a split for ${formatINR(fromPaise(item.summary.amountPaise))}`;
    case "SPLIT_REMOVED":
      return `${item.actorName} removed a split (${formatINR(fromPaise(item.summary.amountPaise))})`;
    case "SETTLEMENT_RECORDED":
      return `${item.actorName} recorded a settlement of ${formatINR(fromPaise(item.summary.amountPaise))}`;
    case "SETTLEMENT_DELETED":
      return `${item.actorName} deleted a settlement of ${formatINR(fromPaise(item.summary.amountPaise))}`;
  }
}

export function ActivityList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>;
  }
  return (
    <TooltipProvider delayDuration={250}>
      <ul className="divide-y divide-border">
        {items.map((item) => {
          const Icon = icons[item.type];
          const createdAt = new Date(item.createdAt);
          return (
            <li key={item.id} className="flex min-w-0 items-start gap-3 py-3">
              <span className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm">{sentence(item)}</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <time dateTime={item.createdAt} className="text-xs text-muted-foreground">
                      {formatDistanceToNow(createdAt, { addSuffix: true })}
                    </time>
                  </TooltipTrigger>
                  <TooltipContent>{format(createdAt, "PPpp")}</TooltipContent>
                </Tooltip>
              </div>
            </li>
          );
        })}
      </ul>
    </TooltipProvider>
  );
}
