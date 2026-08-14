import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { MonthSelector } from "@/components/common/MonthSelector";
import { CardSkeletons, EmptyState, ErrorState } from "@/components/common/States";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { getMonthlySummary, getYearlyTrend } from "@/services/report";
import { CATEGORY_COLORS, MONTHS } from "@/lib/constants";
import { formatINR } from "@/lib/format";
import { STATUS_META } from "@/lib/calculations";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports · FamilyBudget" },
      {
        name: "description",
        content: "Charts for category spending, monthly trends and budget vs actual comparisons.",
      },
      { property: "og:title", content: "Reports · FamilyBudget" },
      {
        property: "og:description",
        content: "Visualise where your family's money goes each month.",
      },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { family } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const summaryQuery = useQuery({
    queryKey: ["summary", family?.id, month, year],
    queryFn: () => getMonthlySummary(family!.id, month, year),
    enabled: Boolean(family?.id),
  });

  const trendQuery = useQuery({
    queryKey: ["trend", family?.id, year],
    queryFn: () => getYearlyTrend(family!.id, year),
    enabled: Boolean(family?.id),
  });

  const summary = summaryQuery.data;
  const pieData = (summary?.categories ?? [])
    .filter((c) => c.spent > 0)
    .map((c) => ({ name: c.category, value: c.spent }));
  const compareData = (summary?.categories ?? [])
    .filter((c) => c.limit > 0 || c.spent > 0)
    .map((c) => ({ name: c.category, Limit: c.limit, Spent: c.spent }));
  const trendData = (trendQuery.data ?? []).map((total, i) => ({
    name: MONTHS[i]?.slice(0, 3) ?? "",
    Spent: total,
  }));

  const tooltipFormatter = (value: number | string) => formatINR(Number(value));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Understand your family's spending patterns."
        actions={
          <MonthSelector
            month={month}
            year={year}
            onChange={(m, y) => {
              setMonth(m);
              setYear(y);
            }}
          />
        }
      />

      {summaryQuery.isLoading ? <CardSkeletons count={2} /> : null}
      {summaryQuery.isError ? <ErrorState onRetry={() => void summaryQuery.refetch()} /> : null}

      {summary ? (
        <>
          <Card className="shadow-soft">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                {MONTHS[month - 1]} {year} summary
              </CardTitle>
              <Badge className={STATUS_META[summary.status].badge}>
                {summary.percent.toFixed(1)}% used
              </Badge>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-4">
              <Metric label="Budget" value={formatINR(summary.totalLimit)} />
              <Metric label="Spent" value={formatINR(summary.totalSpent)} />
              <Metric label="Remaining" value={formatINR(summary.remaining)} />
              <Metric label="Expenses" value={String(summary.expenseCount)} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle className="text-base">Category-wise spending</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {pieData.length === 0 ? (
                  <EmptyState title="No spending this month" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="55%"
                        outerRadius="82%"
                        paddingAngle={2}
                      >
                        {pieData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={CATEGORY_COLORS[entry.name] ?? "var(--primary)"}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={tooltipFormatter} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle className="text-base">Monthly spending in {year}</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {trendQuery.isError ? (
                  <ErrorState onRetry={() => void trendQuery.refetch()} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" fontSize={12} stroke="var(--muted-foreground)" />
                      <YAxis fontSize={12} stroke="var(--muted-foreground)" width={60} />
                      <Tooltip formatter={tooltipFormatter} />
                      <Line
                        type="monotone"
                        dataKey="Spent"
                        stroke="var(--primary)"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">Budget vs actual</CardTitle>
            </CardHeader>
            <CardContent className="h-[340px]">
              {compareData.length === 0 ? (
                <EmptyState
                  title="Nothing to compare yet"
                  description="Add category limits and expenses for this month."
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compareData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" fontSize={11} stroke="var(--muted-foreground)" />
                    <YAxis fontSize={12} stroke="var(--muted-foreground)" width={60} />
                    <Tooltip formatter={tooltipFormatter} />
                    <Legend />
                    <Bar dataKey="Limit" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Spent" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}