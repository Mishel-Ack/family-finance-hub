import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingState } from "@/components/common/States";
import { useAuth } from "@/hooks/useAuth";
import { acceptInvite, getInviteDetails } from "@/services/invites";

export const Route = createFileRoute("/join/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Join a family · FamilyBudget" }] }),
  component: JoinInvitePage,
});

function JoinInvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { session, family, loading, refresh } = useAuth();
  const [leaveExistingFamily, setLeaveExistingFamily] = useState(false);
  const details = useQuery({
    queryKey: ["invite-details", token],
    queryFn: () => getInviteDetails(token),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => acceptInvite(token, leaveExistingFamily),
    onSuccess: async () => {
      await refresh();
      toast.success("You joined the family");
      await navigate({ to: "/dashboard", replace: true });
    },
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-lg shadow-soft">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" aria-hidden />
          </div>
          <CardTitle>Join a FamilyBudget family</CardTitle>
          <CardDescription>
            Invitations are private, single-use links that expire after seven days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {details.isLoading ? <LoadingState label="Checking invitation…" /> : null}
          {details.isError ? (
            <div
              role="alert"
              className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              This invitation is invalid or unavailable. Ask the inviter for a new link.
            </div>
          ) : null}
          {details.data ? (
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">
                {details.data.inviterName} invited you to
              </p>
              <p className="mt-1 text-lg font-semibold">{details.data.familyName}</p>
              <p className="mt-1 text-sm text-muted-foreground">Role: {details.data.role}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Expires {new Date(details.data.expiresAt).toLocaleString()}
              </p>
            </div>
          ) : null}

          {!session && details.data ? (
            <div className="space-y-3">
              <Button asChild className="w-full">
                <Link to="/auth" search={{ invite: token }}>
                  Sign in or create an account
                </Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                New accounts join this family directly instead of creating a separate family.
              </p>
            </div>
          ) : null}

          {session && details.data ? (
            <div className="space-y-4">
              {family ? (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-sm">
                    Your account currently belongs to <strong>{family.name}</strong>. You can switch
                    only if it is an empty solo family with no expenses or budgets.
                  </p>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="leave-current-family"
                      checked={leaveExistingFamily}
                      onCheckedChange={(checked) => setLeaveExistingFamily(checked === true)}
                    />
                    <Label htmlFor="leave-current-family" className="text-sm">
                      Leave my current family and join this one
                    </Label>
                  </div>
                </div>
              ) : null}
              {accept.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  {accept.error instanceof Error
                    ? accept.error.message
                    : "Could not accept this invitation."}
                </p>
              ) : null}
              <Button
                className="w-full"
                disabled={loading || accept.isPending}
                onClick={() => accept.mutate()}
              >
                {accept.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Accept invitation"
                )}
              </Button>
            </div>
          ) : null}
          <div className="text-center text-xs text-muted-foreground">
            <Link to="/" className="underline underline-offset-4">
              Back to FamilyBudget
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
