import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loginSchema, registerSchema } from "@/lib/validations";
import { useAuth } from "@/hooks/useAuth";
import { loginFn, registerFn } from "@/services/auth.server";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in · FamilyBudget" },
      {
        name: "description",
        content:
          "Sign in or create your FamilyBudget account to manage your family's monthly budget and expenses.",
      },
      { property: "og:title", content: "Sign in · FamilyBudget" },
      {
        property: "og:description",
        content: "Access your family's budgets, expenses and spending reports.",
      },
    ],
  }),
  component: AuthPage,
});

type Errors = Record<string, string>;

function AuthPage() {
  const navigate = useNavigate();
  const { session, saveSession } = useAuth();
  const [tab, setTab] = useState("login");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [login, setLogin] = useState({ email: "", password: "" });
  const [register, setRegister] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (session) void navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = loginSchema.safeParse(login);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const user = await loginFn({ data: parsed.data });
      await saveSession(user);
      toast.success("Welcome back!");
      void navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err?.message || "Invalid email or password");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = registerSchema.safeParse(register);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const user = await registerFn({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          password: parsed.data.password,
        },
      });
      await saveSession(user);
      toast.success("Account created successfully!");
      void navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-hero p-10 text-primary-foreground lg:flex">
        <Link to="/" className="flex items-center gap-2.5 text-lg font-semibold">
          <span className="rounded-xl bg-white/15 p-2">
            <PiggyBank className="h-5 w-5" aria-hidden />
          </span>
          FamilyBudget
        </Link>
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">
            Every rupee, accounted for — together.
          </h2>
          <p className="max-w-md text-sm text-primary-foreground/80">
            Plan monthly budgets, set category limits, log daily expenses and see exactly where your
            family's money goes.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/70">Built for Indian households · ₹ INR</p>
      </div>

      <div className="flex items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md shadow-soft">
          <CardHeader>
            <CardTitle className="text-2xl">Welcome to FamilyBudget</CardTitle>
            <CardDescription>Manage your family finances in one place.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form className="space-y-4" onSubmit={handleLogin} noValidate>
                  <Field label="Email" id="login-email" error={errors["email"]}>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      value={login.email}
                      onChange={(e) => setLogin({ ...login, email: e.target.value })}
                    />
                  </Field>
                  <Field label="Password" id="login-password" error={errors["password"]}>
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      value={login.password}
                      onChange={(e) => setLogin({ ...login, password: e.target.value })}
                    />
                  </Field>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form className="space-y-4" onSubmit={handleRegister} noValidate>
                  <Field label="Name" id="reg-name" error={errors["name"]}>
                    <Input
                      id="reg-name"
                      value={register.name}
                      autoComplete="name"
                      onChange={(e) => setRegister({ ...register, name: e.target.value })}
                    />
                  </Field>
                  <Field label="Email" id="reg-email" error={errors["email"]}>
                    <Input
                      id="reg-email"
                      type="email"
                      autoComplete="email"
                      value={register.email}
                      onChange={(e) => setRegister({ ...register, email: e.target.value })}
                    />
                  </Field>
                  <Field label="Password" id="reg-password" error={errors["password"]}>
                    <Input
                      id="reg-password"
                      type="password"
                      autoComplete="new-password"
                      value={register.password}
                      onChange={(e) => setRegister({ ...register, password: e.target.value })}
                    />
                  </Field>
                  <Field
                    label="Confirm password"
                    id="reg-confirm"
                    error={errors["confirmPassword"]}
                  >
                    <Input
                      id="reg-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={register.confirmPassword}
                      onChange={(e) =>
                        setRegister({ ...register, confirmPassword: e.target.value })
                      }
                    />
                  </Field>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              <Link to="/" className="underline underline-offset-4">
                Back to home
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function fieldErrors(issues: { path: (string | number)[]; message: string }[]): Errors {
  const out: Errors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}