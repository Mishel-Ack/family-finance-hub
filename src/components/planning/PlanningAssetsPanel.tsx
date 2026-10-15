import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/auth-context";
import { toPaise } from "@/lib/money";
import {
  contributeToFund,
  createGoal,
  createSinkingFund,
  getPlanningAssets,
} from "@/services/planning-assets";

function formatRupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function PlanningAssetsPanel() {
  const { role } = useAuth();
  const client = useQueryClient();
  const assets = useQuery({ queryKey: ["planning-assets"], queryFn: getPlanningAssets });
  const [fundName, setFundName] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [fundDate, setFundDate] = useState("");
  const [goalName, setGoalName] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [contribution, setContribution] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => client.invalidateQueries({ queryKey: ["planning-assets"] }),
  });
  const canManage = role === "OWNER" || role === "ADMIN";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sinking funds and goals</CardTitle>
        <CardDescription>
          Fund contributions are tracked separately from expenses. Monthly plans round up to the
          next paise.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {assets.isError ? (
          <p role="alert">Could not load funds and goals.</p>
        ) : !assets.data ? (
          <p>Loading funds and goals…</p>
        ) : (
          <>
            {assets.data.funds.map((fund) => (
              <div
                key={fund.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">{fund.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatRupees(fund.contributedPaise)} of {formatRupees(fund.targetPaise)} ·{" "}
                    {formatRupees(fund.monthlySetAsidePaise)}/month · {fund.percent}%
                  </p>
                </div>
                {role !== "VIEWER" && (
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const amount = Number(contribution[fund.id] ?? 0);
                      if (amount > 0)
                        mutation.mutate(() =>
                          contributeToFund({ fundId: fund.id, amountPaise: toPaise(amount) }),
                        );
                    }}
                  >
                    <Label className="sr-only" htmlFor={`contribution-${fund.id}`}>
                      Contribution for {fund.name} in rupees
                    </Label>
                    <Input
                      id={`contribution-${fund.id}`}
                      className="w-28"
                      type="number"
                      min="1"
                      step="0.01"
                      value={contribution[fund.id] ?? ""}
                      onChange={(event) =>
                        setContribution((current) => ({
                          ...current,
                          [fund.id]: event.target.value,
                        }))
                      }
                      required
                    />
                    <Button size="sm" variant="outline" disabled={mutation.isPending}>
                      Contribute
                    </Button>
                  </form>
                )}
              </div>
            ))}
            {assets.data.goals.map((goal) => (
              <div key={goal.id} className="rounded-lg border p-3">
                <p className="font-medium">{goal.name}</p>
                <p className="text-sm text-muted-foreground">
                  Save {formatRupees(goal.targetPaise)} by{" "}
                  {new Date(goal.targetDate).toLocaleDateString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}{" "}
                  · plan {formatRupees(goal.monthlyPlanPaise)}/month
                </p>
              </div>
            ))}
            {assets.data.funds.length + assets.data.goals.length === 0 && (
              <p className="text-sm text-muted-foreground">No active funds or goals yet.</p>
            )}
          </>
        )}
        {canManage && (
          <div className="grid gap-5 border-t pt-5 md:grid-cols-2">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate(() =>
                  createSinkingFund({
                    name: fundName,
                    targetPaise: toPaise(Number(fundAmount)),
                    dueDate: fundDate,
                  }),
                );
                setFundName("");
                setFundAmount("");
              }}
            >
              <h3 className="font-medium">Create a sinking fund</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setFundName("Diwali")}
                >
                  Diwali template
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setFundName("School fees")}
                >
                  School fees template
                </Button>
              </div>
              <Label htmlFor="fund-name">Fund name</Label>
              <Input
                id="fund-name"
                value={fundName}
                onChange={(event) => setFundName(event.target.value)}
                maxLength={80}
                required
              />
              <Label htmlFor="fund-amount">Target (₹)</Label>
              <Input
                id="fund-amount"
                type="number"
                min="1"
                step="0.01"
                value={fundAmount}
                onChange={(event) => setFundAmount(event.target.value)}
                required
              />
              <Label htmlFor="fund-date">Due date</Label>
              <Input
                id="fund-date"
                type="date"
                value={fundDate}
                onChange={(event) => setFundDate(event.target.value)}
                required
              />
              <Button disabled={mutation.isPending}>Create fund</Button>
            </form>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate(() =>
                  createGoal({
                    name: goalName,
                    targetPaise: toPaise(Number(goalAmount)),
                    targetDate: goalDate,
                  }),
                );
                setGoalName("");
                setGoalAmount("");
              }}
            >
              <h3 className="font-medium">Create a savings goal</h3>
              <Label htmlFor="goal-name">Goal name</Label>
              <Input
                id="goal-name"
                value={goalName}
                onChange={(event) => setGoalName(event.target.value)}
                maxLength={80}
                required
              />
              <Label htmlFor="goal-amount">Target (₹)</Label>
              <Input
                id="goal-amount"
                type="number"
                min="1"
                step="0.01"
                value={goalAmount}
                onChange={(event) => setGoalAmount(event.target.value)}
                required
              />
              <Label htmlFor="goal-date">Target date</Label>
              <Input
                id="goal-date"
                type="date"
                value={goalDate}
                onChange={(event) => setGoalDate(event.target.value)}
                required
              />
              <Button disabled={mutation.isPending}>Create goal</Button>
            </form>
          </div>
        )}
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not save this change. Please try again.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
