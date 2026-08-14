import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  IndianRupee,
  PiggyBank,
  ReceiptIndianRupee,
  TrendingDown,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getMonthlySummary } from "@/services/report";
import { StatCard } from "@/components/dashboard/StatCard";
import { PageHeader } from "@/components/common/PageHeader";
import { BudgetProgress } from "@/components/common/BudgetProgress";
import { CardSkeletons, EmptyState, ErrorState } from "@/components/common/States";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatINR } from "@/lib/format";
import { MONTHS } from "@/lib/constants";
import { STATUS_META } from "@/lib/calculations";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · FamilyBudget" },
      {
        name: "description",
        content: "See this month's family budget, spending, remaining balance and alerts.",
      },
      { property: "og:title", content: "Dashboard · FamilyBudget" },
      {
        property: "og:description",
        content: "Monthly budget health, recent expenses and overspending alerts at a glance.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { family, profile } = useAuth();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const query = useQuery({
    queryKey: ["summary", family?.id, month, year],
    queryFn: () => getMonthlySummary(family!.id, month, year),
    enabled: Boolean(family?.id),
  });

  const summary = query.data;
  const status = summary ? STATUS_META[summary.status] : null;
  const alerts = summary?.categories.filter((c) => c.limit > 0 && c.percent >= 90) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${profile?.name?.split(" ")[0] ?? user?.name?.split(" ")[0] ?? "there"}`}
        description={`${MONTHS[month - 1]} ${year} · ${family?.name ?? "Your family"}`}
        actions={
          <div className="flex items-center gap-3">
            <div className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary sm:block">
              {profile?.email || user?.email}
            </div>
            <Button asChild>
              <Link to="/expenses">
                Add expense <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        }
      />

      {query.isLoading ? <CardSkeletons /> : null}
      {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : null}

      {summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Monthly Budget" value={formatINR(summary.totalLimit)} icon={PiggyBank} />
            <StatCard
              label="Total Spent"
              value={formatINR(summary.totalSpent)}
              hint={`${summary.expenseCount} expense${summary.expenseCount === 1 ? "" : "s"}`}
              icon={IndianRupee}
              tone="warning"
            />
            <StatCard
              label="Remaining"
              value={formatINR(summary.remaining)}
              icon={TrendingDown}
              tone={summary.remaining < 0 ? "destructive" : "success"}
            />
            <StatCard
              label="Budget Used"
              value={`${summary.percent.toFixed(1)}%`}
              hint={status?.label}
              icon={ReceiptIndianRupee}
              tone={summary.percent >= 90 ? "destructive" : summary.percent >= 70 ? "warning" : "default"}
            />
          </div>

          {summary.totalLimit === 0 ? (
            <EmptyState
              title="No budget set for this month"
              description="Create a monthly budget to start tracking limits and remaining balance."
              action={
                <Button asChild>
                  <Link to="/budgets">Create budget</Link>
                </Button>
              }
            />
          ) : (
            <Card className="shadow-soft">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Budget status</CardTitle>
                {status ? <Badge className={status.badge}>{status.label}</Badge> : null}
              </CardHeader>
              <CardContent className="space-y-3">
                <BudgetProgress percent={summary.percent} />
                <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                  <span>{formatINR(summary.totalSpent)} spent</span>
                  <span>{formatINR(Math.max(summary.remaining, 0))} left</span>
                </div>
                {summary.remaining < 0 ? (
                  <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                    You have overspent by {formatINR(Math.abs(summary.remaining))} this month.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )}

          {alerts.length > 0 ? (
            <Card className="border-warning/40 shadow-soft">
              <CardHeader>
                <CardTitle className="text-base">Overspending alerts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {alerts.map((c) => (
                  <div
                    key={c.category}
                    className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{c.category}</span>
                    <span className={STATUS_META[c.status].text}>
                      {formatINR(c.spent)} of {formatINR(c.limit)} ({c.percent.toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card className="shadow-soft">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Recent expenses</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/expenses">View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {summary.expenses.length === 0 ? (
                <EmptyState
                  title="No expenses found for this month"
                  description="Log your first expense to see it here."
                  action={
                    <Button asChild>
                      <Link to="/expenses">Add expense</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-border">
                  {summary.expenses.slice(0, 6).map((expense) => (
                    <li key={expense.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {expense.description || expense.category}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {expense.category} · {formatDate(expense.date)}
                          {expense.family_member ? ` · ${expense.family_member}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold">
                        {formatINR(Number(expense.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}