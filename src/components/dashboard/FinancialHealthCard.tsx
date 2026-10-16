import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/hooks/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFinancialHealth } from "@/services/financial-health";
import { formatINR } from "@/lib/format";

export function FinancialHealthCard() {
  const { family } = useAuth();
  const health = useQuery({
    queryKey: ["financial-health", family?.id],
    queryFn: getFinancialHealth,
    enabled: Boolean(family?.id),
  });
  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle className="text-base">Financial health</CardTitle>
        <CardDescription>
          A six-month view based on shared spending, budgets and configured income.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {health.isPending ? (
          <p>Calculating financial health…</p>
        ) : health.isError ? (
          <p role="alert">Could not calculate financial health. Please try again.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-3xl font-semibold">
                {health.data.score.score === null ? "—" : `${health.data.score.score}/100`}
              </p>
              <p className="text-sm text-muted-foreground">{health.data.score.reason}</p>
            </div>
            <div className="h-48" aria-label="Six-month spending and budget trend">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={health.data.trend}>
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(value: number) => formatINR(value / 100)} />
                  <Tooltip
                    formatter={(value) => formatINR(Number(value) / 100)}
                    labelFormatter={(label) => `Month: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="spendPaise"
                    name="Shared spending"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="budgetPaise"
                    name="Budget"
                    stroke="var(--muted-foreground)"
                    strokeDasharray="5 5"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
