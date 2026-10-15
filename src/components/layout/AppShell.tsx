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
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NotificationCenter } from "@/components/layout/NotificationCenter";
import { useAuth } from "@/hooks/auth-context";
import { countQueuedExpenses } from "@/lib/offline-expense-queue";
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
}: {
  onNavigate?: (() => void) | undefined;
  onCommand?: (() => void) | undefined;
}) {
  const { profile, family, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
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
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const { profile, family, user } = useAuth();
  const navigate = useNavigate();
  const [online, setOnline] = useState(true);
  const queryClient = useQueryClient();
  const scope = family?.id && user?.id ? { familyId: family.id, userId: user.id } : undefined;
  const pending = useQuery({
    queryKey: ["pending-expenses", user?.id, family?.id],
    queryFn: () => (scope ? countQueuedExpenses(scope.familyId, scope.userId) : Promise.resolve(0)),
    enabled: Boolean(scope && typeof window !== "undefined"),
  });
  const pendingCount = pending.data ?? 0;
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
  });
  const syncPending = sync.mutate;

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
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 left-0 w-64">
          <SidebarBody onCommand={() => setCommandOpen(true)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <NotificationCenter />
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
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
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/50 px-3 py-2 text-sm"
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sync.isPending}
                    onClick={() => sync.mutate()}
                  >
                    {sync.isPending ? "Syncing…" : "Sync now"}
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
        onOpenChange={setCommandOpen}
        filter={(value, search) => (matchesCommandLabel(value, search) ? 1 : 0)}
      >
        <CommandInput placeholder="Search pages…" aria-label="Search pages" />
        <CommandList>
          <CommandEmpty>No matching pages.</CommandEmpty>
          <CommandGroup heading="Pages">
            {NAV.map((item) => (
              <CommandItem
                key={item.to}
                value={item.label}
                onSelect={() => {
                  setCommandOpen(false);
                  void navigate({ to: item.to });
                }}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
