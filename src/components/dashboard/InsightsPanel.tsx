import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/common/States";
import { useAuth } from "@/hooks/auth-context";
import { dismissInsight, giveInsightFeedback, listInsights } from "@/services/insights";

function reasonFromPayload(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || !("reason" in payload)) {
    return "A shared spending pattern is available to review.";
  }
  return typeof payload.reason === "string"
    ? payload.reason
    : "A shared spending pattern is available to review.";
}

function titleFromType(type: string): string {
  return type
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function InsightsPanel() {
  const { family } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["insights", family?.id],
    queryFn: listInsights,
    enabled: Boolean(family?.id),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["insights", family?.id] });
  const dismiss = useMutation({
    mutationFn: dismissInsight,
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const feedback = useMutation({
    mutationFn: ({ id, verdict }: { id: string; verdict: "USEFUL" | "NOT_USEFUL" }) =>
      giveInsightFeedback(id, verdict),
    onSuccess: () => {
      void refresh();
      toast.success("Thanks for the feedback");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Family insights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading ? <LoadingState label="Checking shared spending patterns…" /> : null}
        {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : null}
        {!query.isLoading && !query.isError && query.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not enough new shared-data patterns to show yet.
          </p>
        ) : null}
        {query.data?.map((insight) => (
          <article key={insight.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{titleFromType(insight.type)}</h3>
              <Badge variant={insight.severity === "HIGH" ? "destructive" : "secondary"}>
                {insight.severity.toLowerCase()} priority
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{reasonFromPayload(insight.payload)}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={feedback.isPending || dismiss.isPending}
                onClick={() => feedback.mutate({ id: insight.id, verdict: "NOT_USEFUL" })}
              >
                Not useful
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={feedback.isPending || dismiss.isPending}
                onClick={() => dismiss.mutate(insight.id)}
              >
                Dismiss
              </Button>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
