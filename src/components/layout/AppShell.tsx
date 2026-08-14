import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Wallet,
  ReceiptIndianRupee,
  PieChart,
  UserRound,
  Settings,
  LogOut,
  Menu,
  PiggyBank,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/budgets", label: "Budgets", icon: Wallet },
  { to: "/expenses", label: "Expenses", icon: ReceiptIndianRupee },
  { to: "/reports", label: "Reports", icon: PieChart },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
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

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
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
      <NavLinks onNavigate={onNavigate} />

      <div className="mt-auto space-y-3">
        <div className="h-px bg-sidebar-border" />
        <Link
          to="/profile"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Settings className="h-4 w-4" aria-hidden />
          Settings
        </Link>
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

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 left-0 w-64">
          <SidebarBody />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-0 p-0">
              <SidebarBody onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="text-base font-semibold tracking-tight">FamilyBudget</span>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}