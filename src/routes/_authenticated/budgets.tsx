import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MonthSelector } from "@/components/common/MonthSelector";
import { BudgetProgress } from "@/components/common/BudgetProgress";
import { CardSkeletons, EmptyState, ErrorState } from "@/components/common/States";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { getMonthlySummary } from "@/services/report";
import {
  deleteBudgetCategory,
  listBudgetCategories,
  upsertBudget,
  upsertBudgetCategory,
} from "@/services/budget";
import { CATEGORIES, MONTHS } from "@/lib/constants";
import { formatINR } from "@/lib/format";
import { STATUS_META } from "@/lib/calculations";
import { budgetSchema, categoryLimitSchema } from "@/lib/validations";

export const Route = createFileRoute("/_authenticated/budgets")({
  head: () => ({
    meta: [
      { title: "Budgets · FamilyBudget" },
      {
        name: "description",
        content: "Create monthly family budgets and set category-wise spending limits in rupees.",
      },
      { property: "og:title", content: "Budgets · FamilyBudget" },
      {
        property: "og:description",
        content: "Plan monthly totals and per-category limits for your family.",
      },
    ],
  }),
  component: BudgetsPage,
});

function BudgetsPage() {
  const { family, canEdit } = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [totalInput, setTotalInput] = useState("");
  const [totalError, setTotalError] = useState("");
  const [catDialog, setCatDialog] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; category: string; limit: string } | null>(
    null,
  );
  const [catError, setCatError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; category: string } | null>(null);

  const key = ["summary", family?.id, month, year];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getMonthlySummary(family!.id, month, year),
    enabled: Boolean(family?.id),
  });
  const summary = query.data;

  useEffect(() => {
    setTotalInput(summary && summary.totalLimit > 0 ? String(summary.totalLimit) : "");
  }, [summary?.totalLimit, month, year]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["summary"] });
  };

  const saveBudget = useMutation({
    mutationFn: async () => {
      const parsed = budgetSchema.safeParse({
        month,
        year,
        totalLimit: Number(totalInput),
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid budget");
      }
      return upsertBudget(family!.id, month, year, parsed.data.totalLimit);
    },
    onSuccess: () => {
      setTotalError("");
      toast.success("Budget saved");
      invalidate();
    },
    onError: (error: Error) => setTotalError(error.message),
  });

  const saveCategory = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const parsed = categoryLimitSchema.safeParse({
        category: editing.category,
        limitAmount: Number(editing.limit),
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid limit");
      let budgetId = summary?.budgetId ?? null;
      if (!budgetId) throw new Error("Create the monthly budget first");
      await upsertBudgetCategory(budgetId, parsed.data.category, parsed.data.limitAmount);
    },
    onSuccess: () => {
      setCatError("");
      setCatDialog(false);
      setEditing(null);
      toast.success("Category limit saved");
      invalidate();
    },
    onError: (error: Error) => setCatError(error.message),
  });

  const removeCategory = useMutation({
    mutationFn: async (id: string) => deleteBudgetCategory(id),
    onSuccess: () => {
      toast.success("Category limit deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openCategoryDialog = async (category?: string) => {
    setCatError("");
    if (!summary?.budgetId) {
      toast.error("Create the monthly budget first");
      return;
    }
    const rows = await listBudgetCategories(summary.budgetId);
    const existing = category ? rows.find((r) => r.category === category) : undefined;
    setEditing({
      ...(existing ? { id: existing.id } : {}),
      category: category ?? CATEGORIES[0],
      limit: existing ? String(existing.limit_amount) : "",
    });
    setCatDialog(true);
  };

  const withLimits = summary?.categories.filter((c) => c.limit > 0) ?? [];
  const overAllocated = summary ? summary.allocated > summary.totalLimit : false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        description="Set your monthly budget and category-wise limits."
        actions={<MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />}
      />

      {query.isLoading ? <CardSkeletons count={3} /> : null}
      {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : null}

      {summary ? (
        <>
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">
                {MONTHS[month - 1]} {year} budget
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="total-budget">Total monthly budget (₹)</Label>
                  <Input
                    id="total-budget"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    placeholder="50000"
                    value={totalInput}
                    disabled={!canEdit}
                    onChange={(e) => setTotalInput(e.target.value)}
                  />
                  {totalError ? <p className="text-xs text-destructive">{totalError}</p> : null}
                </div>
                <Button
                  onClick={() => saveBudget.mutate()}
                  disabled={!canEdit || saveBudget.isPending}
                >
                  {summary.budgetId ? "Update budget" : "Create budget"}
                </Button>
              </div>

              {summary.totalLimit > 0 ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat label="Allocated" value={formatINR(summary.allocated)} />
                  <Stat
                    label="Unallocated"
                    value={formatINR(summary.totalLimit - summary.allocated)}
                  />
                  <Stat label="Spent" value={formatINR(summary.totalSpent)} />
                </div>
              ) : null}

              {overAllocated ? (
                <p className="flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  Category limits ({formatINR(summary.allocated)}) exceed the total monthly budget.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Category limits</CardTitle>
              <Button size="sm" onClick={() => void openCategoryDialog()} disabled={!canEdit}>
                <Plus className="mr-1 h-4 w-4" /> Add limit
              </Button>
            </CardHeader>
            <CardContent>
              {withLimits.length === 0 ? (
                <EmptyState
                  title="No category limits yet"
                  description="Split your monthly budget across categories like Food, Bills and Transport."
                />
              ) : (
                <ul className="space-y-4">
                  {withLimits.map((c) => (
                    <li key={c.category} className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{c.category}</span>
                          <Badge className={STATUS_META[c.status].badge}>
                            {c.percent.toFixed(0)}%
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {formatINR(c.spent)} / {formatINR(c.limit)}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Edit ${c.category} limit`}
                            disabled={!canEdit}
                            onClick={() => void openCategoryDialog(c.category)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete ${c.category} limit`}
                            disabled={!canEdit}
                            onClick={async () => {
                              const rows = await listBudgetCategories(summary.budgetId!);
                              const row = rows.find((r) => r.category === c.category);
                              if (row) setDeleteTarget({ id: row.id, category: c.category });
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <BudgetProgress percent={c.percent} />
                      <p className="text-xs text-muted-foreground">
                        {c.remaining >= 0
                          ? `${formatINR(c.remaining)} remaining`
                          : `Over by ${formatINR(Math.abs(c.remaining))}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Category limit</DialogTitle>
            <DialogDescription>Set how much this category can spend this month.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat">Category</Label>
              <Select
                value={editing?.category}
                onValueChange={(v) => setEditing((e) => (e ? { ...e, category: v } : e))}
              >
                <SelectTrigger id="cat">
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
              <Label htmlFor="cat-limit">Limit (₹)</Label>
              <Input
                id="cat-limit"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={editing?.limit ?? ""}
                onChange={(e) => setEditing((x) => (x ? { ...x, limit: e.target.value } : x))}
              />
              {catError ? <p className="text-xs text-destructive">{catError}</p> : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveCategory.mutate()} disabled={saveCategory.isPending}>
              Save limit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.category} limit?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the category limit. Expenses in this category stay untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && removeCategory.mutate(deleteTarget.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}