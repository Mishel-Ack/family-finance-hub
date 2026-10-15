import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/format";
import { todayISO } from "@/lib/format";
import { toPaise } from "@/lib/money";
import {
  advanceRecurringSubscription,
  createManualRecurringSubscription,
  listRecurringSubscriptions,
  updateRecurringSubscriptionStatus,
} from "@/services/subscriptions";
import { useAuth } from "@/hooks/auth-context";

export const Route = createFileRoute("/_authenticated/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions · FamilyBudget" }] }),
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const { family, canEdit } = useAuth();
  const queryClient = useQueryClient();
  const [merchant, setMerchant] = useState("");
  const [intervalDays, setIntervalDays] = useState("30");
  const [nextExpectedDate, setNextExpectedDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["subscriptions", family?.id] });
  const updateStatus = useMutation({
    mutationFn: updateRecurringSubscriptionStatus,
    onSuccess: refresh,
    onError: () => toast.error("Could not update this recurring payment."),
  });
  const addManual = useMutation({
    mutationFn: createManualRecurringSubscription,
    onSuccess: async () => {
      setMerchant("");
      setAmount("");
      await refresh();
      toast.success("Recurring payment added");
    },
    onError: () => toast.error("Could not add this recurring payment."),
  });
  const advance = useMutation({
    mutationFn: advanceRecurringSubscription,
    onSuccess: async () => {
      await refresh();
      toast.success("Payment marked paid; the next reminder is scheduled.");
    },
    onError: () => toast.error("Could not update the recurring payment schedule."),
  });
  const subscriptions = useQuery({
    queryKey: ["subscriptions", family?.id],
    queryFn: listRecurringSubscriptions,
    enabled: Boolean(family?.id),
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurring subscriptions"
        description="Review detected shared charges, confirm reminders, or add a recurring payment manually."
      />
      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a recurring payment</CardTitle>
            <CardDescription>
              Manual entries are shared with your family and can be edited by any family member who
              can add expenses. Marking a payment paid advances its reminder; it does not add an
              expense record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(event) => {
                event.preventDefault();
                addManual.mutate({
                  merchant,
                  intervalDays: Number(intervalDays),
                  nextExpectedDate,
                  ...(amount ? { typicalAmountPaise: toPaise(Number(amount)) } : {}),
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="recurring-merchant">Payment name</Label>
                <Input
                  id="recurring-merchant"
                  value={merchant}
                  onChange={(event) => setMerchant(event.target.value)}
                  maxLength={120}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recurring-interval">Interval (days)</Label>
                <Input
                  id="recurring-interval"
                  type="number"
                  min="1"
                  max="365"
                  value={intervalDays}
                  onChange={(event) => setIntervalDays(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recurring-next-date">Next expected date</Label>
                <Input
                  id="recurring-next-date"
                  type="date"
                  value={nextExpectedDate}
                  onChange={(event) => setNextExpectedDate(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recurring-amount">Typical amount (₹, optional)</Label>
                <Input
                  id="recurring-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <Button className="sm:col-span-2 lg:col-span-4" disabled={addManual.isPending}>
                {addManual.isPending ? "Adding…" : "Add recurring payment"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
      {subscriptions.isPending ? <p>Checking shared expense history…</p> : null}
      {subscriptions.isError ? (
        <p role="alert">Could not load recurring charges. Please try again.</p>
      ) : null}
      {subscriptions.data?.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No recurring charges have been detected yet. Add a few shared transactions from the same
            merchant to improve detection.
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {subscriptions.data?.map((subscription) => (
          <Card key={subscription.merchant}>
            <CardHeader>
              <CardTitle className="capitalize">{subscription.merchant}</CardTitle>
              <CardDescription>
                Every {subscription.intervalDays} days · {subscription.status.toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>Typical amount: {formatINR(subscription.typicalAmountPaise / 100)}</p>
              <p>Next expected: {subscription.nextExpectedDate}</p>
              <p>Confidence: {Math.round(subscription.confidence * 100)}%</p>
              <p className="pt-2 text-muted-foreground">{subscription.reason}</p>
              {canEdit ? (
                <div className="flex flex-wrap gap-2 pt-3">
                  {subscription.status === "CONFIRMED" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={advance.isPending}
                        onClick={() => advance.mutate(subscription.merchant)}
                      >
                        Mark paid
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={updateStatus.isPending}
                        onClick={() =>
                          updateStatus.mutate({
                            merchant: subscription.merchant,
                            status: "DISMISSED",
                          })
                        }
                      >
                        Dismiss
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      disabled={updateStatus.isPending}
                      onClick={() =>
                        updateStatus.mutate({
                          merchant: subscription.merchant,
                          status: "CONFIRMED",
                          intervalDays: subscription.intervalDays,
                          nextExpectedDate: subscription.nextExpectedDate,
                          ...(subscription.typicalAmountPaise > 0
                            ? { typicalAmountPaise: subscription.typicalAmountPaise }
                            : {}),
                        })
                      }
                    >
                      Confirm reminders
                    </Button>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
