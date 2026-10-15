import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Wallet,
  ReceiptIndianRupee,
  PieChart,
  Users,
  UserRound,
  Settings,
  LogOut,
  Menu,
  PiggyBank,
  ArrowLeftRight,
  SlidersHorizontal,
  Sparkles,
  Repeat,
  Search,
  Plus,
  ShoppingBag,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { NotificationCenter } from "@/components/layout/NotificationCenter";
import { useAuth } from "@/hooks/auth-context";
import {
  clearQueuedExpenses,
  countQueuedExpenses,
  listQueuedExpenses,
  removeQueuedExpense,
} from "@/lib/offline-expense-queue";
import { syncQueuedExpenses } from "@/services/expense";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { matchesCommandLabel } from "@/lib/command-filter";
import { searchExpensesForCommand } from "@/services/expense";
import { formatINR } from "@/lib/format";
import type { PendingExpense } from "@/lib/offline-expense-queue";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/budgets", label: "Budgets", icon: Wallet },
  { to: "/expenses", label: "Expenses", icon: ReceiptIndianRupee },
  { to: "/coach", label: "AI Coach", icon: Sparkles },
  { to: "/members", label: "Members", icon: Users },
  { to: "/balances", label: "Balances", icon: ArrowLeftRight },
  { to: "/reports", label: "Reports", icon: PieChart },
  { to: "/story", label: "Money Story", icon: PieChart },
  { to: "/approvals", label: "Approvals", icon: ReceiptIndianRupee },
  { to: "/planner", label: "Planner", icon: SlidersHorizontal },
  { to: "/subscriptions", label: "Subscriptions", icon: Repeat },
  { to: "/profile", label: "Settings", icon: Settings },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1" aria-label="Main navigation">
      {NAV.map((item) => {
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="h-4 w-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({
  onNavigate,
  onCommand,
  pendingCount,
  pendingStatusKnown,
  onSignOut,
}: {
  onNavigate?: (() => void) | undefined;
  onCommand?: (() => void) | undefined;
  pendingCount: number;
  pendingStatusKnown: boolean;
  onSignOut: (discardPending: boolean) => Promise<boolean>;
}) {
  const { profile, family } = useAuth();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const handleSignOut = () => {
    if (!pendingStatusKnown || pendingCount > 0) setSignOutOpen(true);
    else void onSignOut(false);
  };
  const signOutWithChoice = (discardPending: boolean) => {
    setSigningOut(true);
    void onSignOut(discardPending)
      .then((signedOut) => {
        if (signedOut) setSignOutOpen(false);
      })
      .finally(() => setSigningOut(false));
  };

  return (
    <div className="flex h-full flex-col bg-sidebar px-4 py-5 text-sidebar-foreground">
      <Link to="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 px-1">
        <span className="rounded-xl bg-sidebar-primary p-2 text-sidebar-primary-foreground">
          <PiggyBank className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-lg font-semibold tracking-tight">FamilyBudget</span>
      </Link>

      <div className="my-5 h-px bg-sidebar-border" />
      <Button
        type="button"
        variant="outline"
        className="mb-3 justify-start border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-accent"
        onClick={onCommand}
        aria-label="Search pages (Ctrl+K)"
      >
        <Search className="mr-2 h-4 w-4" aria-hidden />
        Search pages <span className="ml-auto text-xs opacity-70">Ctrl+K</span>
      </Button>
      <NavLinks onNavigate={onNavigate} />

      <div className="mt-auto space-y-3">
        <div className="h-px bg-sidebar-border" />
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Logout
        </button>
        <div className="rounded-lg bg-sidebar-accent/60 px-3 py-2.5">
          <p className="truncate text-sm font-medium">{profile?.name ?? "Member"}</p>
          <p className="truncate text-xs text-sidebar-foreground/70">{family?.name ?? "Family"}</p>
        </div>
      </div>
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Offline expenses are still waiting</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatusKnown
                ? `${pendingCount} expense${pendingCount === 1 ? " is" : "s are"} saved on this device. `
                : "Offline drafts could not be checked. "}
              Keep any drafts for your next sign-in, or discard this account’s drafts before signing
              out.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOut}>Stay signed in</AlertDialogCancel>
            <Button
              variant="outline"
              disabled={signingOut}
              onClick={() => signOutWithChoice(false)}
            >
              Keep drafts and sign out
            </Button>
            <AlertDialogAction
              disabled={signingOut}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                signOutWithChoice(true);
              }}
            >
              Discard drafts and sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");
  const { profile, family, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [online, setOnline] = useState(true);
  const [queueOpen, setQueueOpen] = useState(false);
  const queryClient = useQueryClient();
  const scope = family?.id && user?.id ? { familyId: family.id, userId: user.id } : undefined;
  const pending = useQuery({
    queryKey: ["pending-expenses", user?.id, family?.id],
    queryFn: () => (scope ? countQueuedExpenses(scope.familyId, scope.userId) : Promise.resolve(0)),
    enabled: Boolean(scope && typeof window !== "undefined"),
  });
  const pendingCount = pending.data ?? 0;
  const queuedExpenses = useQuery({
    queryKey: ["queued-expense-details", user?.id, family?.id],
    queryFn: () => (scope ? listQueuedExpenses(scope.familyId, scope.userId) : Promise.resolve([])),
    enabled: Boolean(scope && queueOpen),
  });
  const expenseSearch = useQuery({
    queryKey: ["command-expense-search", family?.id, user?.id, commandSearch.trim()],
    queryFn: () => searchExpensesForCommand(commandSearch.trim()),
    enabled: Boolean(commandOpen && family?.id && user?.id && commandSearch.trim().length >= 2),
  });
  const refreshPending = pending.refetch;
  const sync = useMutation({
    mutationFn: () => {
      if (!scope) throw new Error("Your family account is not ready.");
      return syncQueuedExpenses(scope);
    },
    onSuccess: async (count) => {
      if (count) toast.success(`${count} offline expense${count === 1 ? "" : "s"} synced`);
      await queryClient.invalidateQueries({
        queryKey: ["pending-expenses", user?.id, family?.id],
      });
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (error: Error) => toast.error(`Offline expenses could not sync: ${error.message}`),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["pending-expenses", user?.id, family?.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["queued-expense-details", user?.id, family?.id],
      });
    },
  });
  const syncPending = sync.mutate;
  const removeQueued = useMutation({
    mutationFn: removeQueuedExpense,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["pending-expenses", user?.id, family?.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["queued-expense-details", user?.id, family?.id],
      });
    },
    onError: () => toast.error("Could not discard this offline expense."),
  });
  const discardAll = useMutation({
    mutationFn: () => {
      if (!scope) throw new Error("Your family account is not ready.");
      return clearQueuedExpenses(scope.familyId, scope.userId);
    },
    onSuccess: async (count) => {
      toast.success(`${count} queued expense${count === 1 ? "" : "s"} discarded`);
      await queryClient.invalidateQueries({
        queryKey: ["pending-expenses", user?.id, family?.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["queued-expense-details", user?.id, family?.id],
      });
    },
    onError: () => toast.error("Could not discard queued expenses."),
  });
  const signOutNow = async (discardPending: boolean) => {
    try {
      if (discardPending && scope) await clearQueuedExpenses(scope.familyId, scope.userId);
      await queryClient.cancelQueries();
      queryClient.clear();
      await signOut();
      navigate({ to: "/auth", replace: true });
      return true;
    } catch {
      toast.error(
        discardPending
          ? "Could not safely discard queued expenses. You are still signed in."
          : "Could not sign out. Please try again.",
      );
      return false;
    }
  };
  const closeCommand = () => {
    setCommandOpen(false);
    setCommandSearch("");
  };

  useEffect(() => {
    const updateConnection = () => {
      const isOnline = navigator.onLine;
      setOnline(isOnline);
      void refreshPending();
      if (isOnline && pendingCount > 0) syncPending();
    };
    const updatePending = () => void refreshPending();
    setOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    window.addEventListener("offline-expense-queue-changed", updatePending);
    if (navigator.onLine && pendingCount > 0) syncPending();
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener("offline-expense-queue-changed", updatePending);
    };
  }, [family?.id, user?.id, pendingCount, refreshPending, syncPending]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-64 shrink-0 print:hidden lg:block">
        <div className="fixed inset-y-0 left-0 w-64">
          <SidebarBody
            onCommand={() => setCommandOpen(true)}
            pendingCount={pendingCount}
            pendingStatusKnown={pending.isSuccess}
            onSignOut={signOutNow}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <NotificationCenter />
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur print:hidden lg:hidden">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-0 p-0">
                <SidebarBody
                  onNavigate={() => setOpen(false)}
                  pendingCount={pendingCount}
                  pendingStatusKnown={pending.isSuccess}
                  onSignOut={signOutNow}
                  onCommand={() => {
                    setOpen(false);
                    setCommandOpen(true);
                  }}
                />
              </SheetContent>
            </Sheet>
            <span className="text-base font-semibold tracking-tight">FamilyBudget</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search pages (Ctrl+K)"
            onClick={() => setCommandOpen(true)}
          >
            <Search className="h-5 w-5" aria-hidden />
          </Button>
          {profile?.name ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {profile.name}
            </span>
          ) : null}
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl space-y-6">
            {!online || (pending.data ?? 0) > 0 || pending.isError ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/50 px-3 py-2 text-sm print:hidden"
                role={pending.isError ? "alert" : "status"}
              >
                <span>
                  {pending.isError
                    ? "Offline expense status is unavailable."
                    : !online
                      ? "You are offline."
                      : ""}
                  {!pending.isError && (pending.data ?? 0) > 0
                    ? ` ${pending.data} expense${pending.data === 1 ? "" : "s"} waiting to sync.`
                    : ""}
                </span>
                {online && (pending.data ?? 0) > 0 ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setQueueOpen(true)}>
                      Review drafts
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sync.isPending}
                      onClick={() => sync.mutate()}
                    >
                      {sync.isPending ? "Syncing…" : "Sync now"}
                    </Button>
                  </div>
                ) : (pending.data ?? 0) > 0 ? (
                  <Button size="sm" variant="outline" onClick={() => setQueueOpen(true)}>
                    Review drafts
                  </Button>
                ) : null}
              </div>
            ) : null}
            {children}
          </div>
        </main>
      </div>
      <CommandDialog
        open={commandOpen}
        onOpenChange={(nextOpen) => {
          setCommandOpen(nextOpen);
          if (!nextOpen) setCommandSearch("");
        }}
        filter={(value, search) => (matchesCommandLabel(value, search) ? 1 : 0)}
      >
        <CommandInput
          placeholder="Search pages, actions, and expenses…"
          aria-label="Search pages, actions, and expenses"
          value={commandSearch}
          onValueChange={setCommandSearch}
        />
        <CommandList>
          <CommandEmpty>No matching pages, actions, or expenses.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem
              value="Add expense create transaction"
              onSelect={() => {
                closeCommand();
                void navigate({ to: "/expenses", search: { add: true } });
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add expense
            </CommandItem>
            <CommandItem
              value="Request purchase approval"
              onSelect={() => {
                closeCommand();
                void navigate({ to: "/approvals" });
              }}
            >
              <ShoppingBag className="h-4 w-4" aria-hidden />
              Open purchase request
            </CommandItem>
            <CommandItem
              value="Sync offline queued pending expenses"
              disabled={!online || pendingCount === 0 || sync.isPending}
              onSelect={() => {
                closeCommand();
                syncPending();
              }}
            >
              <Repeat className="h-4 w-4" aria-hidden />
              {sync.isPending ? "Syncing offline expenses…" : "Sync offline expenses"}
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Pages">
            {NAV.map((item) => (
              <CommandItem
                key={item.to}
                value={item.label}
                onSelect={() => {
                  closeCommand();
                  void navigate({ to: item.to });
                }}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
          {commandSearch.trim().length >= 2 ? (
            <CommandGroup heading="Matching expenses">
              {expenseSearch.isPending ? (
                <CommandItem value="Searching expenses" disabled>
                  Searching…
                </CommandItem>
              ) : expenseSearch.isError ? (
                <CommandItem value="Expense search unavailable" disabled>
                  Expense search unavailable.
                </CommandItem>
              ) : (
                (expenseSearch.data ?? []).map((expense) => (
                  <CommandItem
                    key={expense.id}
                    value={`Expense ${expense.description} ${expense.category} ${expense.date}`}
                    onSelect={() => {
                      closeCommand();
                      void navigate({
                        to: "/expenses",
                        search: { q: expense.description || expense.category },
                      });
                    }}
                  >
                    <ReceiptIndianRupee className="h-4 w-4" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      {expense.description || expense.category} · {expense.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatINR(expense.amountPaise / 100)} · {expense.date}
                    </span>
                    {expense.visibility === "PRIVATE" ? (
                      <span className="text-xs text-muted-foreground">Private</span>
                    ) : null}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
      <Dialog open={queueOpen} onOpenChange={setQueueOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Offline expense drafts</DialogTitle>
            <DialogDescription>
              These drafts are stored on this device and scoped to your account. Sync when online or
              discard individual items.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {queuedExpenses.isLoading ? <p>Loading saved drafts…</p> : null}
            {queuedExpenses.isError ? (
              <p role="alert">Could not load offline drafts. Please close and retry.</p>
            ) : null}
            {queuedExpenses.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No offline expense drafts remain.</p>
            ) : null}
            {(queuedExpenses.data ?? []).map((expense: PendingExpense) => (
              <div
                key={expense.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {expense.input.description || "Expense"} · {expense.input.date}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatINR(Number(expense.input.amount))} · {expense.input.visibility}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={removeQueued.isPending}
                  onClick={() => removeQueued.mutate(expense.key)}
                >
                  Discard
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            {online && (queuedExpenses.data?.length ?? 0) > 0 ? (
              <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
                {sync.isPending ? "Syncing…" : "Retry sync"}
              </Button>
            ) : null}
            {(queuedExpenses.data?.length ?? 0) > 0 ? (
              <Button
                variant="destructive"
                disabled={discardAll.isPending}
                onClick={() => discardAll.mutate()}
              >
                {discardAll.isPending ? "Discarding…" : "Discard all drafts"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
