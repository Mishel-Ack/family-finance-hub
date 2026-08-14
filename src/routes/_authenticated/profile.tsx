import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
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
import { useAuth } from "@/hooks/useAuth";
import {
  addFamilyMember,
  listFamilyMembers,
  removeFamilyMember,
  updateProfileName,
} from "@/services/family";
import { profileSchema } from "@/lib/validations";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile · FamilyBudget" },
      {
        name: "description",
        content: "Manage your FamilyBudget account details, family and family members.",
      },
      { property: "og:title", content: "Profile · FamilyBudget" },
      { property: "og:description", content: "Your account, family and role settings." },
    ],
  }),
  component: ProfilePage,
});

const ROLES = ["ADMIN", "MEMBER", "VIEWER"];

function ProfilePage() {
  const { profile, family, role, user, canEdit, refresh } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("MEMBER");

  useEffect(() => {
    setName(profile?.name ?? "");
  }, [profile?.name]);

  const membersQuery = useQuery({
    queryKey: ["members", family?.id],
    queryFn: () => listFamilyMembers(family!.id),
    enabled: Boolean(family?.id),
  });

  const saveName = useMutation({
    mutationFn: async () => {
      const parsed = profileSchema.safeParse({ name });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid name");
      await updateProfileName(user!.id, parsed.data.name);
    },
    onSuccess: async () => {
      setError("");
      toast.success("Profile updated");
      await refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const addMember = useMutation({
    mutationFn: async () => {
      const trimmed = memberName.trim();
      if (trimmed.length < 2) throw new Error("Member name must be at least 2 characters");
      await addFamilyMember(family!.id, trimmed, memberRole);
    },
    onSuccess: () => {
      setMemberName("");
      toast.success("Family member added");
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMember = useMutation({
    mutationFn: async (id: string) => removeFamilyMember(id),
    onSuccess: () => {
      toast.success("Family member removed");
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your account and family settings." />

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
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Family</CardTitle>
            <CardDescription>Your household and role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
              <span className="text-sm text-muted-foreground">Family</span>
              <span className="text-sm font-medium">{family?.name ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
              <span className="text-sm text-muted-foreground">Your role</span>
              <Badge variant="secondary">{role ?? "—"}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">Family members</CardTitle>
          <CardDescription>
            People in your household. Expenses can be attributed to any of them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Member name"
              aria-label="New family member name"
              value={memberName}
              maxLength={80}
              disabled={!canEdit}
              onChange={(e) => setMemberName(e.target.value)}
            />
            <Select value={memberRole} onValueChange={setMemberRole}>
              <SelectTrigger className="sm:w-40" aria-label="Member role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => addMember.mutate()} disabled={!canEdit || addMember.isPending}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>

          {membersQuery.isLoading ? <LoadingState label="Loading members…" /> : null}
          {membersQuery.isError ? (
            <ErrorState onRetry={() => void membersQuery.refetch()} />
          ) : null}
          {membersQuery.data ? (
            membersQuery.data.length === 0 ? (
              <EmptyState title="No family members yet" />
            ) : (
              <ul className="divide-y divide-border">
                {membersQuery.data.map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {member.display_name || "Member"}
                        {member.user_id === user?.id ? " (you)" : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {member.user_id ? "Linked account" : "Household member"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{member.role}</Badge>
                      {member.role !== "OWNER" && canEdit ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${member.display_name}`}
                          onClick={() => deleteMember.mutate(member.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}