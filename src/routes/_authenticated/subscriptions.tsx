import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import { listRecurringSubscriptions } from "@/services/subscriptions";
import { useAuth } from "@/hooks/auth-context";

export const Route = createFileRoute("/_authenticated/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions · FamilyBudget" }] }),
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const { family } = useAuth();
  const subscriptions = useQuery({
    queryKey: ["subscriptions", family?.id],
    queryFn: listRecurringSubscriptions,
    enabled: Boolean(family?.id),
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurring subscriptions"
        description="Recurring charges detected from shared family expenses in the last 12 months."
      />
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
