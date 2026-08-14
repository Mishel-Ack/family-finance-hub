import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  PiggyBank,
  ArrowRight,
  ShieldCheck,
  PieChart,
  Users,
  AlertTriangle,
  Wallet,
  CheckCircle2,
  Lock,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FamilyBudget — Smart Family Budget & Expense Management" },
      {
        name: "description",
        content:
          "Plan monthly budgets, track daily expenses, set category limits, avoid overspending, and manage family finances together in Indian Rupees (₹).",
      },
      { property: "og:title", content: "FamilyBudget — Smart Family Budget & Expense Management" },
      {
        property: "og:description",
        content:
          "Track expenses, set category limits, receive overspending alerts, and view visual reports with real database persistence.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [session, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header / Navbar */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <PiggyBank className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="text-xl font-bold tracking-tight text-foreground">
              FamilyBudget
            </span>
          </div>

          <div className="flex items-center gap-3">
            {session ? (
              <Button asChild size="sm" className="font-medium">
                <Link to="/dashboard">Go to Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="font-medium">
                  <Link to="/auth">Sign In</Link>
                </Button>
                <Button asChild size="sm" className="font-medium">
                  <Link to="/auth">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-hero py-20 text-primary-foreground sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-medium text-primary-foreground backdrop-blur-sm">
                <ShieldCheck className="h-4 w-4" /> Built for Indian Households · ₹ INR
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Every rupee, accounted for — together as a family.
              </h1>
              <p className="mt-6 text-lg text-primary-foreground/85 sm:text-xl">
                FamilyBudget helps households set monthly spending targets, track category limits, receive smart overspending alerts, and visualize financial growth.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
                <Button asChild size="lg" className="bg-white text-brand-deep hover:bg-white/90 font-semibold shadow-lift">
                  <Link to="/auth">
                    Create Family Account <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white font-medium">
                  <Link to="/auth">Login to App</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Everything you need to master household finances
              </h2>
              <p className="mt-4 text-muted-foreground">
                Designed like a modern fintech platform with persistent database synchronization.
              </p>
            </div>

            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="border border-border/60 shadow-soft transition-all hover:shadow-lift">
                <CardContent className="pt-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Monthly Budgeting</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Set overall family budgets per month and allocate specific limits to categories like Food, Bills, Healthcare, and Education.
                  </p>
                </CardContent>
              </Card>

              <Card className="border border-border/60 shadow-soft transition-all hover:shadow-lift">
                <CardContent className="pt-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Overspending Warnings</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Automatic status tracking alerts you when spending hits 70%, 90%, or exceeds 100% of your allocated monthly limits.
                  </p>
                </CardContent>
              </Card>

              <Card className="border border-border/60 shadow-soft transition-all hover:shadow-lift">
                <CardContent className="pt-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <PieChart className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Visual Analytics & Reports</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Explore spending distribution with interactive donut charts, monthly trends, and budget-vs-actual comparison bars powered by Recharts.
                  </p>
                </CardContent>
              </Card>

              <Card className="border border-border/60 shadow-soft transition-all hover:shadow-lift">
                <CardContent className="pt-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Users className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Family Architecture</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Built with multi-member role hierarchy (Owner, Admin, Member, Viewer) so family members can collaborate securely.
                  </p>
                </CardContent>
              </Card>

              <Card className="border border-border/60 shadow-soft transition-all hover:shadow-lift">
                <CardContent className="pt-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Daily Expense Tracking</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Log daily transactions with category tags, descriptions, dates, and member attribution. Filter, search, and sort instantly.
                  </p>
                </CardContent>
              </Card>

              <Card className="border border-border/60 shadow-soft transition-all hover:shadow-lift">
                <CardContent className="pt-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Lock className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Row-Level Security</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Strict PostgreSQL database policies guarantee that your family data remains private and strictly accessible only to authenticated family members.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Product Callout Section */}
        <section className="bg-muted/50 py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-border bg-card p-8 shadow-soft sm:p-12">
              <div className="grid items-center gap-8 lg:grid-cols-2">
                <div>
                  <h3 className="text-2xl font-bold text-foreground">
                    Ready to transform how your family manages money?
                  </h3>
                  <p className="mt-3 text-muted-foreground">
                    Join FamilyBudget today to get instant clarity on your monthly spending, category allocations, and budget progress.
                  </p>
                  <ul className="mt-6 space-y-2 text-sm font-medium text-foreground">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> Full support for Indian Rupee (₹) formatting
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> Mobile and desktop optimized design
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> Instant budget over-allocation alerts
                    </li>
                  </ul>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
                  <Button asChild size="lg" className="w-full sm:w-auto">
                    <Link to="/auth">Register New Family</Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                    <Link to="/auth">Sign In to Account</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-background py-8 text-center text-sm text-muted-foreground">
        <div className="mx-auto max-w-7xl px-4">
          <p>© {new Date().getFullYear()} FamilyBudget. All rights reserved. Professional Family Budget & Expense Platform.</p>
        </div>
      </footer>
    </div>
  );
}
