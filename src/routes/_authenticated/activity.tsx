import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Activity as ActivityIcon } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { ActivityList } from "@/components/activity/ActivityList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardSkeletons, ErrorState } from "@/components/common/States";
import { useAuth } from "@/hooks/useAuth";
import { listActivityPage } from "@/services/activity";
import { listFamilyMembers } from "@/services/family";
import { activitySearchSchema, type ActivityFilter } from "@/lib/activity-queries";

export const Route = createFileRoute("/_authenticated/activity")({
  validateSearch: (search: Record<string, unknown>) => activitySearchSchema.parse(search),
  head: () => ({ meta: [{ title: "Activity · FamilyBudget" }] }),
  component: ActivityPage,
});

const groups: Array<{ value: ActivityFilter | "ALL"; label: string }> = [
  { value: "ALL", label: "All activity" },
  { value: "EXPENSES", label: "Expenses" },
  { value: "BUDGETS", label: "Budgets" },
  { value: "CATEGORIES", label: "Categories" },
  { value: "MEMBERS", label: "Members" },
];

function ActivityPage() {
  const { family, user } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const membersQuery = useQuery({
    queryKey: ["members", family?.id],
    queryFn: () => listFamilyMembers(),
    enabled: Boolean(family?.id),
  });
  const feedQuery = useInfiniteQuery({
    queryKey: ["activity", family?.id, user?.id, search.memberId, search.type],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listActivityPage({
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
        ...(search.memberId ? { memberId: search.memberId } : {}),
        ...(search.type ? { type: search.type } : {}),
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(family?.id),
    refetchOnWindowFocus: true,
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "visible" ? 30_000 : false,
  });
  const items = feedQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="Recent changes in your family." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          value={search.memberId ?? "ALL"}
          onValueChange={(value) =>
            void navigate({
              search: (previous) => ({
                ...previous,
                memberId: value === "ALL" ? undefined : value,
              }),
            })
          }
        >
          <SelectTrigger aria-label="Filter activity by member">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Everyone</SelectItem>
            {(membersQuery.data ?? []).map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.display_name}
              </SelectItem>
            ))}
            {search.memberId &&
            !(membersQuery.data ?? []).some((member) => member.id === search.memberId) ? (
              <SelectItem value={search.memberId}>Former member</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        <Select
          value={search.type ?? "ALL"}
          onValueChange={(value) =>
            void navigate({
              search: (previous) => ({
                ...previous,
                type: value === "ALL" ? undefined : (value as ActivityFilter),
              }),
            })
          }
        >
          <SelectTrigger aria-label="Filter activity by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectItem key={group.value} value={group.value}>
                {group.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {feedQuery.isPending ? <CardSkeletons count={1} /> : null}
      {feedQuery.isError ? <ErrorState onRetry={() => void feedQuery.refetch()} /> : null}
      {feedQuery.data ? (
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ActivityIcon className="h-4 w-4" />
              Family activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityList items={items} />
            {feedQuery.hasNextPage ? (
              <Button
                className="mt-3 w-full"
                variant="outline"
                onClick={() => void feedQuery.fetchNextPage()}
                disabled={feedQuery.isFetchingNextPage}
              >
                {feedQuery.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            ) : items.length > 20 ? (
              <p className="pt-3 text-center text-sm text-muted-foreground">
                You’re all caught up.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <Button variant="ghost" asChild>
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
