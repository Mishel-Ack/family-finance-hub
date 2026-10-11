import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/auth-context";
import { generateFamilyStory, getFamilyStory } from "@/services/family-story";

export const Route = createFileRoute("/_authenticated/story")({
  head: () => ({ meta: [{ title: "Family Money Story · FamilyBudget" }] }),
  component: StoryPage,
});

function rupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}
const storyDataSchema = z.object({
  totalPaise: z.number(),
  previousMonthTotalPaise: z.number(),
  changePaise: z.number(),
  budgetPaise: z.number(),
  remainingPaise: z.number(),
  topCategories: z.array(z.object({ name: z.string(), amountPaise: z.number() })),
  biggestExpense: z
    .object({ amountPaise: z.number(), description: z.string(), date: z.string() })
    .nullable(),
});

function StoryPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const { role } = useAuth();
  const report = useQuery({
    queryKey: ["family-story", month, year],
    queryFn: () => getFamilyStory(month, year),
  });
  const generate = useMutation({
    mutationFn: () => generateFamilyStory(month, year),
    onSuccess: () => report.refetch(),
  });
  const parsed = storyDataSchema.safeParse(report.data?.data);
  const data = parsed.success ? parsed.data : undefined;
  return (
    <div className="space-y-6 print:space-y-3">
      <PageHeader
        title="Family Money Story"
        description="A monthly summary based on shared family expenses."
      />
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="space-y-1 text-sm">
          Month
          <select
            className="block h-10 rounded-md border bg-background px-3"
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index} value={index + 1}>
                {new Date(2000, index).toLocaleString("en-IN", { month: "long" })}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Year
          <input
            className="block h-10 w-24 rounded-md border bg-background px-3"
            type="number"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          />
        </label>
        {(role === "OWNER" || role === "ADMIN") && (
          <Button disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? "Generating…" : "Generate story"}
          </Button>
        )}
        <Button variant="outline" onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>
      {report.isLoading ? (
        <p>Loading report…</p>
      ) : report.isError ? (
        <p role="alert">Could not load this report.</p>
      ) : !data ? (
        <Card>
          <CardContent className="pt-6">
            No story has been generated for this month yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{report.data?.narrative}</CardTitle>
              <CardDescription>
                Shared spending only · generated{" "}
                {report.data?.generatedAt.toLocaleDateString("en-IN")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <p>
                Total shared spending: <strong>{rupees(data.totalPaise)}</strong>
              </p>
              <p>
                Change from prior month: <strong>{rupees(data.changePaise)}</strong>
              </p>
              <p>
                Budget remaining: <strong>{rupees(data.remainingPaise)}</strong>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.topCategories.map((category) => (
                <div key={category.name} className="flex justify-between border-b py-2">
                  <span>{category.name}</span>
                  <span>{rupees(category.amountPaise)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          {data.biggestExpense && (
            <Card>
              <CardHeader>
                <CardTitle>Largest shared expense</CardTitle>
              </CardHeader>
              <CardContent>
                {data.biggestExpense.description || "Expense"} ·{" "}
                {rupees(data.biggestExpense.amountPaise)} · {data.biggestExpense.date}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
