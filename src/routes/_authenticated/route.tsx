import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { LoadingState } from "@/components/common/States";
import { useAuth } from "@/hooks/auth-context";
import { createFamily } from "@/services/family";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, family, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [familyName, setFamilyName] = useState("");
  const createMutation = useMutation({
    mutationFn: () => createFamily(familyName),
    onSuccess: async () => {
      await refresh();
      await navigate({ to: "/dashboard", replace: true });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!loading && !session) {
      void navigate({ to: "/auth", replace: true });
    }
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <LoadingState label="Preparing your workspace…" />
        </div>
      </div>
    );
  }

  if (session && !family) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>You’re no longer in a family</CardTitle>
            <CardDescription>
              Your account is active, but it no longer has access to a family. Create one or join
              using an invitation link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                createMutation.mutate();
              }}
            >
              <Label htmlFor="new-family-name">New family name</Label>
              <Input
                id="new-family-name"
                value={familyName}
                onChange={(event) => setFamilyName(event.target.value)}
                minLength={2}
                maxLength={80}
                required
              />
              <Button type="submit" disabled={createMutation.isPending}>
                Create a new family
              </Button>
            </form>
            <div className="space-y-2">
              <Label htmlFor="invite-url">Use an invite link</Label>
              <Input
                id="invite-url"
                placeholder="Paste an invitation URL"
                onChange={(event) => {
                  const value = event.target.value.trim();
                  try {
                    const url = new URL(value, window.location.origin);
                    if (
                      url.origin === window.location.origin &&
                      /^\/join\/[^/]+$/.test(url.pathname)
                    )
                      window.location.assign(url.href);
                  } catch {
                    /* Wait for a valid invite URL. */
                  }
                }}
              />
              <Button variant="outline" onClick={() => void navigate({ to: "/auth" })}>
                Sign out or switch account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
