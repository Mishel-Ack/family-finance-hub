import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/auth-context";
import { fromPaise, toPaise } from "@/lib/money";
import { listCategories } from "@/services/category";
import {
  cancelPurchaseRequest,
  decidePurchaseRequest,
  listPurchaseRequests,
  submitPurchaseRequest,
} from "@/services/purchase-requests";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: "Purchase approvals · FamilyBudget" }] }),
  component: ApprovalPage,
});

function rupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(fromPaise(paise));
}

function ApprovalPage() {
  const { family, memberId, role } = useAuth();
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const categories = useQuery({
    queryKey: ["categories", family?.id],
    queryFn: listCategories,
    enabled: Boolean(family?.id),
  });
  const requests = useQuery({
    queryKey: ["purchase-requests", family?.id],
    queryFn: listPurchaseRequests,
    enabled: Boolean(family?.id),
  });
  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () => client.invalidateQueries({ queryKey: ["purchase-requests", family?.id] }),
  });
  const canDecide = role === "OWNER" || role === "ADMIN";
  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase approvals"
        description="Requests are proposals. Approved purchases still need to be entered as normal expenses."
      />
      {role !== "VIEWER" && (
        <Card>
          <CardHeader>
            <CardTitle>Request a purchase</CardTitle>
            <CardDescription>Impact is calculated from shared spending only.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate(() =>
                  submitPurchaseRequest({
                    title,
                    amountPaise: toPaise(Number(amount)),
                    categoryId,
                    note,
                  }),
                );
                setTitle("");
                setAmount("");
                setNote("");
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="request-title">Item or purpose</Label>
                <Input
                  id="request-title"
                  maxLength={120}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="request-amount">Amount (₹)</Label>
                <Input
                  id="request-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="request-category">Category</Label>
                <select
                  id="request-category"
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  required
                >
                  <option value="">Choose a category</option>
                  {(categories.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="request-note">Note</Label>
                <Textarea
                  id="request-note"
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              <Button className="sm:col-span-2" disabled={mutation.isPending || !categoryId}>
                Submit request
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      {requests.isLoading ? (
        <p>Loading requests…</p>
      ) : requests.isError ? (
        <p role="alert">Could not load purchase requests.</p>
      ) : (
        <div className="space-y-3">
          {(requests.data ?? []).map((request) => {
            const snapshot = request.impactSnapshot as {
              totalBudgetRemainingPaise?: number;
              categoryBudgetRemainingPaise?: number;
            };
            return (
              <Card key={request.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                    <span>{request.title}</span>
                    <span className="text-base">{rupees(request.amountPaise)}</span>
                  </CardTitle>
                  <CardDescription>
                    {request.requester.displayName} · {request.category.name} ·{" "}
                    {request.status.toLowerCase()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{request.note || "No note provided."}</p>
                  <p className="text-sm text-muted-foreground">
                    Budget remaining before request: total{" "}
                    {rupees(snapshot.totalBudgetRemainingPaise ?? 0)}, category{" "}
                    {rupees(snapshot.categoryBudgetRemainingPaise ?? 0)}. Private expenses excluded.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {canDecide && request.status === "PENDING" && (
                      <>
                        <Button
                          disabled={mutation.isPending}
                          onClick={() =>
                            mutation.mutate(() =>
                              decidePurchaseRequest({
                                id: request.id,
                                status: "APPROVED",
                                decisionNote: "",
                              }),
                            )
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          disabled={mutation.isPending}
                          onClick={() =>
                            mutation.mutate(() =>
                              decidePurchaseRequest({
                                id: request.id,
                                status: "REJECTED",
                                decisionNote: "",
                              }),
                            )
                          }
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {request.requesterMemberId === memberId && request.status === "PENDING" && (
                      <Button
                        variant="ghost"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate(() => cancelPurchaseRequest(request.id))}
                      >
                        Cancel request
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {requests.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No purchase requests yet.</p>
          )}
        </div>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not complete this request. Refresh and try again.
        </p>
      )}
    </div>
  );
}
