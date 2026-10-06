import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBalances, recordSettlement, deleteSettlement } from "@/services/balances";
import { formatINR } from "@/lib/format";
import { fromPaise, toPaise } from "@/lib/money";
import { useAuth } from "@/hooks/auth-context";

export const Route = createFileRoute("/_authenticated/balances")({ component: BalancesPage });

function BalancesPage() {
  const { role, memberId } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["balances"], queryFn: getBalances });
  const [fromMemberId, setFromMemberId] = useState("");
  const [toMemberId, setToMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [settling, setSettling] = useState(false);
  const memberNames = useMemo(
    () => new Map((query.data?.members ?? []).map((item) => [item.memberId, item.name])),
    [query.data],
  );
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["balances"] });
  const record = useMutation({
    mutationFn: () => recordSettlement({ fromMemberId, toMemberId, amount: Number(amount), note }),
    onSuccess: () => {
      toast.success("Payment recorded");
      setSettling(false);
      setAmount("");
      setNote("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: deleteSettlement,
    onSuccess: () => {
      toast.success("Settlement deleted");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const openSuggested = (from: string, to: string, paise: number) => {
    setFromMemberId(from);
    setToMemberId(to);
    setAmount(String(fromPaise(paise)));
    setSettling(true);
  };
  const currentDebtor = query.data?.members.find((item) => item.memberId === fromMemberId);
  const overpay =
    currentDebtor &&
    amount &&
    toPaise(Number(amount)) > Math.abs(Math.min(0, currentDebtor.netPaise));
  const canDeleteAny = role === "OWNER" || role === "ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Balances"
        description="Suggested payments use only shared expenses that have a split. Unsplit household expenses are not included."
      />
      {query.isLoading ? <LoadingState label="Loading balances…" /> : null}
      {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : null}
      {query.data ? (
        <>
          <section
            aria-label="Member balances"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {query.data.members.map((item) => (
              <Card key={item.memberId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {item.name}
                    {item.memberId === memberId ? " · You" : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className={`text-xl font-semibold ${item.netPaise > 0 ? "text-emerald-600" : item.netPaise < 0 ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {item.netPaise > 0 ? "Owed " : item.netPaise < 0 ? "Owes " : "Settled · "}
                    {formatINR(fromPaise(Math.abs(item.netPaise)))}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
          <Card>
            <CardHeader>
              <CardTitle>Suggested payments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {query.data.suggestedPayments.length === 0 ? (
                <EmptyState
                  title="All settled up"
                  description="There are no outstanding balances from split expenses."
                />
              ) : (
                query.data.suggestedPayments.map((transfer) => (
                  <div
                    key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <p className="flex items-center gap-2">
                      <ArrowLeftRight className="h-4 w-4" aria-hidden />
                      {memberNames.get(transfer.fromMemberId) ?? "Former member"} pays{" "}
                      {memberNames.get(transfer.toMemberId) ?? "Former member"}{" "}
                      <strong>{formatINR(fromPaise(transfer.amountPaise))}</strong>
                    </p>
                    <Button
                      onClick={() =>
                        openSuggested(
                          transfer.fromMemberId,
                          transfer.toMemberId,
                          transfer.amountPaise,
                        )
                      }
                    >
                      Record payment
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Settlement history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {query.data.settlements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                query.data.settlements.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 border-b py-2 last:border-0"
                  >
                    <div>
                      <p>
                        {item.fromName} paid {item.toName} ·{" "}
                        {formatINR(fromPaise(item.amountPaise))}
                      </p>
                      {item.note ? (
                        <p className="text-sm text-muted-foreground">{item.note}</p>
                      ) : null}
                    </div>
                    {canDeleteAny || item.createdByMemberId === memberId ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete settlement"
                        onClick={() => remove.mutate(item.id)}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
      {settling ? (
        <Card>
          <CardHeader>
            <CardTitle>Record a payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="settlement-from">Paid by</Label>
                <Select value={fromMemberId} onValueChange={setFromMemberId}>
                  <SelectTrigger id="settlement-from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {query.data?.members
                      .filter((item) => !item.former)
                      .map((item) => (
                        <SelectItem key={item.memberId} value={item.memberId}>
                          {item.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="settlement-to">Paid to</Label>
                <Select value={toMemberId} onValueChange={setToMemberId}>
                  <SelectTrigger id="settlement-to">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {query.data?.members
                      .filter((item) => !item.former)
                      .map((item) => (
                        <SelectItem key={item.memberId} value={item.memberId}>
                          {item.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="settlement-amount">Amount (₹)</Label>
              <Input
                id="settlement-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="settlement-note">Note (optional)</Label>
              <Textarea
                id="settlement-note"
                maxLength={200}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            {overpay ? (
              <p role="status" className="text-sm text-amber-700">
                This payment exceeds the current debt and will create an opposite balance.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                onClick={() => record.mutate()}
                disabled={
                  record.isPending ||
                  !amount ||
                  !fromMemberId ||
                  !toMemberId ||
                  fromMemberId === toMemberId
                }
              >
                Save payment
              </Button>
              <Button variant="outline" onClick={() => setSettling(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
