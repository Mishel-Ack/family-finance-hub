import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  changeFamilyMemberRole,
  createFamily,
  leaveFamily,
  listFamilyMembers,
  removeFamilyMember,
  transferOwnership,
} from "@/services/family";

export const Route = createFileRoute("/_authenticated/members")({ component: MembersPage });
const assignableRoles = ["ADMIN", "MEMBER", "VIEWER"] as const;

function MembersPage() {
  const { family, role, user } = useAuth();
  const client = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"ADMIN" | "MEMBER" | "VIEWER">("MEMBER");
  const [familyNameConfirm, setFamilyNameConfirm] = useState("");
  const query = useQuery({
    queryKey: ["members", family?.id],
    queryFn: listFamilyMembers,
    enabled: Boolean(family?.id),
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["members", family?.id] });
  };
  const roleMutation = useMutation({
    mutationFn: ({ id, nextRole }: { id: string; nextRole: "ADMIN" | "MEMBER" | "VIEWER" }) =>
      changeFamilyMemberRole(id, nextRole),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const removeMutation = useMutation({
    mutationFn: removeFamilyMember,
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const addMutation = useMutation({
    mutationFn: () => addFamilyMember(newName, newRole),
    onSuccess: async () => {
      setNewName("");
      await refresh();
      toast.success("Member added");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const leaveMutation = useMutation({
    mutationFn: leaveFamily,
    onSuccess: () => window.location.reload(),
    onError: (error: Error) => toast.error(error.message),
  });
  const transferMutation = useMutation({
    mutationFn: (targetId: string) => transferOwnership(targetId, familyNameConfirm),
    onSuccess: async () => {
      toast.success("Ownership transferred");
      window.location.reload();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const canManage = role === "OWNER" || role === "ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Family members"
        description="Manage access, roles, and membership for your family."
      />
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add household member</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Input
              aria-label="New family member name"
              placeholder="Name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <Select value={newRole} onValueChange={(value) => setNewRole(value as typeof newRole)}>
              <SelectTrigger aria-label="New member role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(role === "OWNER" ? assignableRoles : (["MEMBER", "VIEWER"] as const)).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !newName.trim()}
            >
              Add
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardContent className="pt-6">
          {query.isLoading ? <LoadingState label="Loading family members…" /> : null}
          {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : null}
          {query.data?.length ? (
            <ul className="divide-y divide-border">
              {query.data.map((member) => {
                const self = member.user_id === user?.id;
                const canChange =
                  canManage &&
                  !self &&
                  member.role !== "OWNER" &&
                  (role === "OWNER" || member.role !== "ADMIN");
                const canRemove =
                  canManage &&
                  !self &&
                  member.role !== "OWNER" &&
                  (role === "OWNER" || member.role === "MEMBER" || member.role === "VIEWER");
                const choices =
                  role === "OWNER" ? assignableRoles : (["MEMBER", "VIEWER"] as const);
                return (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {member.display_name || "Member"}
                        {self ? " (you)" : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Joined{" "}
                        {member.created_at ? new Date(member.created_at).toLocaleDateString() : "—"}{" "}
                        · Last activity{" "}
                        {member.last_activity_at
                          ? new Date(member.last_activity_at).toLocaleString()
                          : "Never"}{" "}
                        · {member.user_id ? "Linked account" : "Household member"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{member.role}</Badge>
                      {canChange ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) =>
                            roleMutation.mutate({
                              id: member.id,
                              nextRole: value as "ADMIN" | "MEMBER" | "VIEWER",
                            })
                          }
                        >
                          <SelectTrigger
                            aria-label={`Change role for ${member.display_name}`}
                            className="w-36"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {choices.map((value) => (
                              <SelectItem key={value} value={value}>
                                {value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                      {canRemove ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeMutation.mutate(member.id)}
                          disabled={removeMutation.isPending}
                        >
                          Remove
                        </Button>
                      ) : null}
                      {role === "OWNER" && !self && member.user_id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => transferMutation.mutate(member.id)}
                          disabled={
                            transferMutation.isPending || familyNameConfirm !== family?.name
                          }
                        >
                          Transfer ownership
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : query.data ? (
            <EmptyState title="No family members yet" />
          ) : null}
        </CardContent>
      </Card>
      {role === "OWNER" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transfer ownership</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="family-name-confirm">
              Type {family?.name} exactly to enable a transfer
            </Label>
            <Input
              id="family-name-confirm"
              value={familyNameConfirm}
              onChange={(event) => setFamilyNameConfirm(event.target.value)}
            />
            {familyNameConfirm && familyNameConfirm === family?.name ? (
              <p className="text-sm text-muted-foreground">
                Choose Transfer ownership beside the linked account.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {role !== "OWNER" ? (
        <Button
          variant="outline"
          onClick={() => leaveMutation.mutate()}
          disabled={leaveMutation.isPending}
        >
          Leave family
        </Button>
      ) : null}
    </div>
  );
}
