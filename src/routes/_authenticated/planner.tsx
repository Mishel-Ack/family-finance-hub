import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createScenario,
  deleteScenario,
  listScenarios,
  renameScenario,
  runPlanner,
} from "@/services/planner";
import { toPaise } from "@/lib/money";
import type { ScenarioChange, SimulationResult } from "@/lib/ml/simulate";
import { PlanningAssetsPanel } from "@/components/planning/PlanningAssetsPanel";
import { useAuth } from "@/hooks/auth-context";

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
  const { family, role } = useAuth();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState("");
  const [scenarioName, setScenarioName] = useState("");
  const [editingScenario, setEditingScenario] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");
  const [changes, setChanges] = useState<ScenarioChange[]>([]);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const scenarios = useQuery({
    queryKey: ["planner-scenarios", family?.id],
    queryFn: listScenarios,
    enabled: Boolean(family?.id),
  });
  const simulation = useMutation({
    mutationFn: (changes: ScenarioChange[]) => runPlanner(changes),
    onSuccess: setResult,
  });
  const save = useMutation({
    mutationFn: createScenario,
    onSuccess: async () => {
      setScenarioName("");
      await queryClient.invalidateQueries({ queryKey: ["planner-scenarios", family?.id] });
    },
  });
  const rename = useMutation({
    mutationFn: renameScenario,
    onSuccess: async () => {
      setEditingScenario(null);
      await queryClient.invalidateQueries({ queryKey: ["planner-scenarios", family?.id] });
    },
  });
  const remove = useMutation({
    mutationFn: deleteScenario,
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ["planner-scenarios", family?.id] }),
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
              const nextChanges =
                paise > 0 ? [{ type: "SAVINGS_TARGET" as const, amountPaise: paise }] : [];
              setChanges(nextChanges);
              simulation.mutate(nextChanges);
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
      <Card>
        <CardHeader>
          <CardTitle>Saved scenarios</CardTitle>
          <CardDescription>
            Scenarios are visible to your family. Private expenses are never included.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {scenarios.isLoading ? <p>Loading saved scenarios…</p> : null}
          {scenarios.isError ? (
            <p role="alert">Could not load saved scenarios. Please try again.</p>
          ) : null}
          {scenarios.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scenarios saved yet.</p>
          ) : null}
          {scenarios.data?.map((scenario) => (
            <div
              key={scenario.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              {editingScenario === scenario.id ? (
                <form
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    rename.mutate({ id: scenario.id, name: editedName });
                  }}
                >
                  <Label className="sr-only" htmlFor={`scenario-name-${scenario.id}`}>
                    New name for {scenario.name}
                  </Label>
                  <Input
                    id={`scenario-name-${scenario.id}`}
                    className="max-w-xs"
                    value={editedName}
                    onChange={(event) => setEditedName(event.target.value)}
                    maxLength={80}
                    required
                  />
                  <Button size="sm" disabled={rename.isPending}>
                    Rename
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingScenario(null)}
                  >
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <div>
                    <p className="font-medium">{scenario.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Updated {new Date(scenario.updatedAt).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setChanges(scenario.definition);
                        simulation.mutate(scenario.definition);
                      }}
                      disabled={simulation.isPending}
                    >
                      Load
                    </Button>
                    {role !== "VIEWER" ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingScenario(scenario.id);
                            setEditedName(scenario.name);
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => remove.mutate(scenario.id)}
                          disabled={remove.isPending}
                        >
                          Delete
                        </Button>
                      </>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ))}
          {role !== "VIEWER" ? (
            <form
              className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate({ name: scenarioName, changes });
              }}
            >
              <div className="flex-1 space-y-2">
                <Label htmlFor="new-scenario-name">Save current plan as</Label>
                <Input
                  id="new-scenario-name"
                  value={scenarioName}
                  onChange={(event) => setScenarioName(event.target.value)}
                  maxLength={80}
                  required
                />
              </div>
              <Button disabled={save.isPending || simulation.isPending}>
                {save.isPending ? "Saving…" : "Save scenario"}
              </Button>
            </form>
          ) : null}
          {save.isError || rename.isError || remove.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not save this scenario change. Please check the name and try again.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <PlanningAssetsPanel />
    </div>
  );
}
