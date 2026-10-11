import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runPlanner } from "@/services/planner";
import { toPaise } from "@/lib/money";
import type { ScenarioChange, SimulationResult } from "@/lib/ml/simulate";
import { PlanningAssetsPanel } from "@/components/planning/PlanningAssetsPanel";

export const Route = createFileRoute("/_authenticated/planner")({
  head: () => ({ meta: [{ title: "Planner · FamilyBudget" }] }),
  component: PlannerPage,
});

function rupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function PlannerPage() {
  const [target, setTarget] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const simulation = useMutation({
    mutationFn: (changes: ScenarioChange[]) => runPlanner(changes),
    onSuccess: setResult,
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="What-if planner"
        description="Explore a 12-month range using shared family spending history."
      />
      <Card>
        <CardHeader>
          <CardTitle>Savings target</CardTitle>
          <CardDescription>
            Calculations use shared expenses only. Private expenses do not affect this plan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const paise = toPaise(Number(target));
              simulation.mutate(paise > 0 ? [{ type: "SAVINGS_TARGET", amountPaise: paise }] : []);
            }}
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="savings-target">Target amount (₹)</Label>
              <Input
                id="savings-target"
                type="number"
                min="1"
                step="1"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                required
              />
            </div>
            <Button disabled={simulation.isPending}>
              {simulation.isPending ? "Calculating…" : "Run plan"}
            </Button>
          </form>
        </CardContent>
      </Card>
      {simulation.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not calculate the plan. Please try again.
        </p>
      )}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle>12-month projection</CardTitle>
            <CardDescription>{result.reason}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              Data:{" "}
              {result.dataSufficiency === "SUFFICIENT"
                ? "enough history for a projection"
                : "not enough data yet"}
            </p>
            <p>
              Projected cumulative savings: {rupees(result.cumulativeSavingsRangePaise.p10)}–
              {rupees(result.cumulativeSavingsRangePaise.p90)} (middle estimate{" "}
              {rupees(result.cumulativeSavingsRangePaise.p50)}).
            </p>
            <p>
              Chance of meeting the target:{" "}
              {result.probabilityMeetingSavingsTarget === null
                ? "income is not configured"
                : `${Math.round(result.probabilityMeetingSavingsTarget * 100)}%`}
            </p>
          </CardContent>
        </Card>
      )}
      <PlanningAssetsPanel />
    </div>
  );
}
