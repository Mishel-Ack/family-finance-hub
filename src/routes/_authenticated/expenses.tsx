import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { createExpense, deleteExpense, listExpenses, updateExpense } from "@/services/expense";
import { CATEGORIES } from "@/lib/constants";
import { formatDate, formatINR, todayISO } from "@/lib/format";
import { expenseSchema } from "@/lib/validations";
import type { Expense } from "@/types";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses · FamilyBudget" },
      {
        name: "description",
        content: "Add, edit, search and filter your family's daily expenses in rupees.",
      },
      { property: "og:title", content: "Expenses · FamilyBudget" },
      {
        property: "og:description",
        content: "A searchable history of every family expense with categories and members.",
      },
    ],
  }),
  component: ExpensesPage,
});

const emptyForm = {
  amount: "",
  category: CATEGORIES[0] as string,
  date: todayISO(),
  description: "",
  familyMember: "",
};

function ExpensesPage() {
  const { family, user, canEdit } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("date-desc");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  const query = useQuery({
    queryKey: ["expenses", family?.id],
    queryFn: () => listExpenses(family!.id),
    enabled: Boolean(family?.id),
  });

  const rows = useMemo(() => {
    let list = query.data ?? [];
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (e) =>
          e.description.toLowerCase().includes(term) ||
          e.category.toLowerCase().includes(term) ||
          e.family_member.toLowerCase().includes(term),
      );
    }
    if (category !== "all") list = list.filter((e) => e.category === category);
    if (from) list = list.filter((e) => e.date >= from);
    if (to) list = list.filter((e) => e.date <= to);
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "date-asc":
          return a.date.localeCompare(b.date);
        case "amount-desc":
          return Number(b.amount) - Number(a.amount);
        case "amount-asc":
          return Number(a.amount) - Number(b.amount);
        default:
          return b.date.localeCompare(a.date);
      }
    });
    return sorted;
  }, [query.data, search, category, from, to, sort]);

  const total = rows.reduce((sum, e) => sum + Number(e.amount), 0);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["expenses"] });
    void queryClient.invalidateQueries({ queryKey: ["summary"] });
    void queryClient.invalidateQueries({ queryKey: ["trend"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const parsed = expenseSchema.safeParse({
        amount: Number(form.amount),
        category: form.category,
        date: form.date,
        description: form.description,
        familyMember: form.familyMember,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid expense");
      const input = {
        amount: parsed.data.amount,
        category: parsed.data.category,
        date: parsed.data.date,
        description: parsed.data.description ?? "",
        familyMember: parsed.data.familyMember ?? "",
      };
      if (editId) await updateExpense(editId, input);
      else await createExpense(family!.id, user!.id, input);
    },
    onSuccess: () => {
      toast.success(editId ? "Expense updated" : "Expense added");
      setOpen(false);
      setEditId(null);
      setForm({ ...emptyForm });
      setError("");
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => deleteExpense(id),
    onSuccess: () => {
      toast.success("Expense deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setError("");
    setOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditId(expense.id);
    setForm({
      amount: String(expense.amount),
      category: expense.category,
      date: expense.date,
      description: expense.description,
      familyMember: expense.family_member,
    });
    setError("");
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Every rupee your family spends, in one searchable list."
        actions={
          <Button onClick={openCreate} disabled={!canEdit}>
            <Plus className="mr-1 h-4 w-4" /> Add expense
          </Button>
        }
      />

      <Card className="shadow-soft">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search description, category, member"
              aria-label="Search expenses"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="Filter by category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              type="date"
              aria-label="From date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              type="date"
              aria-label="To date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger aria-label="Sort expenses">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Newest first</SelectItem>
              <SelectItem value="date-asc">Oldest first</SelectItem>
              <SelectItem value="amount-desc">Highest amount</SelectItem>
              <SelectItem value="amount-asc">Lowest amount</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {query.isLoading ? <LoadingState label="Loading expenses…" /> : null}
      {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : null}

      {query.data ? (
        rows.length === 0 ? (
          <EmptyState
            title="No expenses found"
            description="Try clearing filters, or add your first expense."
            action={
              <Button onClick={openCreate} disabled={!canEdit}>
                Add expense
              </Button>
            }
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {rows.length} expense{rows.length === 1 ? "" : "s"} · {formatINR(total)} total
            </p>

            <Card className="hidden shadow-soft md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(expense.date)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{expense.category}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate">
                          {expense.description || "—"}
                        </TableCell>
                        <TableCell>{expense.family_member || "—"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatINR(Number(expense.amount))}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Edit expense"
                              disabled={!canEdit}
                              onClick={() => openEdit(expense)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Delete expense"
                              disabled={!canEdit}
                              onClick={() => setDeleteTarget(expense)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-3 md:hidden">
              {rows.map((expense) => (
                <Card key={expense.id} className="shadow-soft">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {expense.description || expense.category}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(expense.date)}
                          {expense.family_member ? ` · ${expense.family_member}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold">
                        {formatINR(Number(expense.amount))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{expense.category}</Badge>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Edit expense"
                          disabled={!canEdit}
                          onClick={() => openEdit(expense)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete expense"
                          disabled={!canEdit}
                          onClick={() => setDeleteTarget(expense)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit expense" : "Add expense"}</DialogTitle>
            <DialogDescription>All amounts are in Indian Rupees (₹).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger id="expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={2}
                maxLength={200}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member">Family member</Label>
              <Input
                id="member"
                maxLength={80}
                placeholder="e.g. Priya"
                value={form.familyMember}
                onChange={(e) => setForm({ ...form, familyMember: e.target.value })}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {editId ? "Save changes" : "Add expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${formatINR(Number(deleteTarget.amount))} · ${deleteTarget.category} · ${formatDate(deleteTarget.date)}. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}