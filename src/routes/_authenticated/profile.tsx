import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Plus, Send, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/auth-context";
import { renameFamily, updateOwnDisplayName, updateProfileName } from "@/services/family";
import { profileSchema } from "@/lib/validations";
import type { FamilyRole } from "@/types";
import { createInvite, listPendingInvites, revokeInvite } from "@/services/invites";
import { getAiSettings, setAiEnabled } from "@/services/ai";
import { Switch } from "@/components/ui/switch";
import { getIncomeProfile, setIncomeProfile } from "@/services/insights";
import { fromPaise, toPaise } from "@/lib/money";
import { useTheme } from "@/hooks/theme-context";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Settings · FamilyBudget" },
      {
        name: "description",
        content: "Manage your FamilyBudget account details, family household and members.",
      },
      { property: "og:title", content: "Settings · FamilyBudget" },
      { property: "og:description", content: "Your account, family and role settings." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, family, role, canEdit, displayName: currentDisplayName, refresh } = useAuth();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER" | "VIEWER">("MEMBER");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [newInviteLink, setNewInviteLink] = useState("");
  const canInvite = role === "OWNER" || role === "ADMIN";
  const aiSettingsQuery = useQuery({
    queryKey: ["ai-settings", family?.id],
    queryFn: getAiSettings,
    enabled: role === "OWNER" && Boolean(family?.id),
  });
  const aiToggle = useMutation({
    mutationFn: setAiEnabled,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-settings", family?.id] });
      toast.success("AI setting updated");
    },
    onError: (cause: Error) => toast.error(cause.message),
  });
  const incomeQuery = useQuery({
    queryKey: ["income-profile", family?.id],
    queryFn: getIncomeProfile,
    enabled: (role === "OWNER" || role === "ADMIN") && Boolean(family?.id),
  });
  useEffect(() => {
    setMonthlyIncome(
      incomeQuery.data ? String(fromPaise(incomeQuery.data.monthlyIncomePaise)) : "",
    );
  }, [incomeQuery.data]);
  const saveIncome = useMutation({
    mutationFn: () =>
      setIncomeProfile(monthlyIncome.trim() ? toPaise(Number(monthlyIncome)) : null),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["income-profile", family?.id] }),
        queryClient.invalidateQueries({ queryKey: ["insights", family?.id] }),
      ]);
      toast.success("Monthly income updated");
    },
    onError: (cause: Error) => toast.error(cause.message),
  });

  useEffect(() => {
    setName(profile?.name ?? "");
    setFamilyName(family?.name ?? "");
    setDisplayName(currentDisplayName ?? "");
  }, [profile?.name, family?.name, currentDisplayName]);

  const invitesQuery = useQuery({
    queryKey: ["pending-invites", family?.id],
    queryFn: listPendingInvites,
    enabled: Boolean(family?.id && canInvite),
  });

  const createInviteMutation = useMutation({
    mutationFn: () =>
      createInvite({
        role: inviteRole,
        ...(inviteEmail.trim() ? { email: inviteEmail.trim() } : {}),
      }),
    onSuccess: async (invite) => {
      setNewInviteLink(invite.link);
      setInviteEmail("");
      await queryClient.invalidateQueries({ queryKey: ["pending-invites", family?.id] });
      toast.success("Invite link created. Copy or share it now; it will not be shown again.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeInviteMutation = useMutation({
    mutationFn: revokeInvite,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pending-invites", family?.id] });
      toast.success("Invite revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyInviteLink = async () => {
    if (!newInviteLink) return;
    await navigator.clipboard.writeText(newInviteLink);
    toast.success("Invite link copied");
  };

  const shareInviteLink = async () => {
    if (!newInviteLink) return;
    if (navigator.share) {
      await navigator.share({
        title: `Join ${family?.name ?? "my family"} on FamilyBudget`,
        url: newInviteLink,
      });
      return;
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(newInviteLink)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const saveName = useMutation({
    mutationFn: async () => {
      const parsed = profileSchema.safeParse({ name });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid name");
      await updateProfileName(parsed.data.name);
    },
    onSuccess: async () => {
      setError("");
      toast.success("Profile updated");
      await refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const saveFamilyName = useMutation({
    mutationFn: async () => {
      const trimmed = familyName.trim();
      if (trimmed.length < 2) throw new Error("Family name must be at least 2 characters");
      await renameFamily(trimmed);
    },
    onSuccess: async () => {
      toast.success("Family name updated");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDisplayName = useMutation({
    mutationFn: () => updateOwnDisplayName(displayName),
    onSuccess: async () => {
      toast.success("Display name updated");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account profile, family household, and members."
      />

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>
            Choose a light or dark interface, or follow your device setting.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-sm">
          <Label htmlFor="theme-preference">Color theme</Label>
          <Select
            value={theme}
            onValueChange={(value) => {
              if (value === "light" || value === "dark" || value === "system") setTheme(value);
            }}
          >
            <SelectTrigger id="theme-preference">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>Your email address cannot be changed here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={profile?.email ?? ""} readOnly disabled />
            </div>
            <Button onClick={() => saveName.mutate()} disabled={saveName.isPending}>
              Save changes
            </Button>
            <div className="space-y-1.5">
              <Label htmlFor="member-display-name">Family display name</Label>
              <Input
                id="member-display-name"
                value={displayName}
                maxLength={50}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => saveDisplayName.mutate()}
              disabled={saveDisplayName.isPending}
            >
              Save display name
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Family Household</CardTitle>
            <CardDescription>Your family household name and role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="family-name">Family Name</Label>
              <div className="flex gap-2">
                <Input
                  id="family-name"
                  value={familyName}
                  maxLength={80}
                  disabled={!canEdit}
                  onChange={(e) => setFamilyName(e.target.value)}
                />
                <Button
                  onClick={() => saveFamilyName.mutate()}
                  disabled={!canEdit || saveFamilyName.isPending}
                >
                  Save
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
              <span className="text-sm text-muted-foreground">Your role</span>
              <Badge variant="secondary">{role ?? "OWNER"}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-soft">
        <CardContent className="flex items-center justify-between gap-3 pt-6">
          <p className="text-sm text-muted-foreground">
            Manage family members, roles and ownership.
          </p>
          <Button asChild variant="outline">
            <a href="/members">Open members</a>
          </Button>
        </CardContent>
      </Card>

      {role === "OWNER" ? (
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">AI features</CardTitle>
            <CardDescription>
              When enabled, the text or receipt image you submit for an AI feature is sent to
              Anthropic for processing. FamilyBudget does not store prompts, generated responses,
              receipt images, or raw SMS. Usage metadata is retained for cost controls.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Label htmlFor="family-ai-enabled">Enable AI for this family</Label>
              <p className="text-sm text-muted-foreground">
                This month: {((aiSettingsQuery.data?.usedMicros ?? 0) / 1_000_000).toFixed(2)} USD
                of {((aiSettingsQuery.data?.capMicros ?? 0) / 1_000_000).toFixed(2)} USD
              </p>
            </div>
            <Switch
              id="family-ai-enabled"
              checked={aiSettingsQuery.data?.enabled ?? false}
              disabled={aiSettingsQuery.isLoading || aiToggle.isPending}
              onCheckedChange={(checked) => aiToggle.mutate(checked)}
            />
          </CardContent>
        </Card>
      ) : null}

      {role === "OWNER" || role === "ADMIN" ? (
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Optional income profile</CardTitle>
            <CardDescription>
              Used only to calculate shared-family savings and financial-health insights. Leave
              blank if you do not want to include income.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="monthly-family-income">Monthly household income (₹)</Label>
              <Input
                id="monthly-family-income"
                type="number"
                min="0.01"
                step="0.01"
                value={monthlyIncome}
                onChange={(event) => setMonthlyIncome(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              disabled={
                saveIncome.isPending || Boolean(monthlyIncome && Number(monthlyIncome) <= 0)
              }
              onClick={() => saveIncome.mutate()}
            >
              {monthlyIncome ? "Save income profile" : "Remove income profile"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {canInvite ? (
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Family invitations</CardTitle>
            <CardDescription>
              Create a single-use invite link that expires in seven days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
              <Input
                type="email"
                autoComplete="email"
                placeholder="Email (optional)"
                aria-label="Invite email address (optional)"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value as typeof inviteRole)}
              >
                <SelectTrigger aria-label="Invite role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {role === "OWNER" ? <SelectItem value="ADMIN">ADMIN</SelectItem> : null}
                  <SelectItem value="MEMBER">MEMBER</SelectItem>
                  <SelectItem value="VIEWER">VIEWER</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={() => createInviteMutation.mutate()}
                disabled={createInviteMutation.isPending}
              >
                <Plus className="mr-1 h-4 w-4" /> Create link
              </Button>
            </div>
            {newInviteLink ? (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <Label htmlFor="new-invite-link">Copy or share this link now</Label>
                <Input id="new-invite-link" readOnly value={newInviteLink} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void copyInviteLink()}>
                    <Copy className="mr-1 h-4 w-4" /> Copy link
                  </Button>
                  <Button variant="outline" onClick={() => void shareInviteLink()}>
                    <Send className="mr-1 h-4 w-4" /> Share
                  </Button>
                </div>
              </div>
            ) : null}
            {invitesQuery.isLoading ? <LoadingState label="Loading invitations…" /> : null}
            {invitesQuery.isError ? (
              <ErrorState onRetry={() => void invitesQuery.refetch()} />
            ) : null}
            {invitesQuery.data?.length ? (
              <ul className="divide-y divide-border">
                {invitesQuery.data.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {invite.email || `Link for ${invite.role}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()} ·
                        created by {invite.createdBy} · creator status: {invite.creatorStatus}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Revoke invite for ${invite.email || invite.role}`}
                      disabled={revokeInviteMutation.isPending}
                      onClick={() => revokeInviteMutation.mutate(invite.id)}
                    >
                      <Trash2 className="mr-1 h-4 w-4 text-destructive" /> Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
