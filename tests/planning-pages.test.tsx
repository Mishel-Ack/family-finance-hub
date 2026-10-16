import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === "planner-scenarios") {
      return {
        data: [
          {
            id: "scenario-1",
            name: "Diwali plan",
            updatedAt: "2026-10-01T00:00:00.000Z",
            definition: [],
          },
        ],
        isLoading: false,
        isError: false,
      };
    }
    if (queryKey[0] === "subscriptions") {
      return {
        data: [
          {
            merchant: "Electricity",
            intervalDays: 30,
            status: "CONFIRMED",
            typicalAmountPaise: 2_500,
            nextExpectedDate: "2026-11-01",
            confidence: 0.9,
            reason: "Monthly shared charge",
          },
        ],
        isPending: false,
        isError: false,
      };
    }
    return {
      data: {
        feasibility: {
          isFeasible: null,
          historyMonths: 0,
          requiredHistoryMonths: 3,
          monthlyCommitmentPaise: 0,
        },
        funds: [],
        goals: [],
      },
      isLoading: false,
      isError: false,
    };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/auth-context", () => ({
  useAuth: () => ({
    family: { id: "family-1" },
    role: "OWNER",
    canEdit: true,
  }),
}));

vi.mock("@/services/planner", () => ({
  createScenario: vi.fn(),
  deleteScenario: vi.fn(),
  listScenarios: vi.fn(),
  renameScenario: vi.fn(),
  runPlanner: vi.fn(),
}));

vi.mock("@/services/planning-assets", () => ({
  contributeToFund: vi.fn(),
  createGoal: vi.fn(),
  createSinkingFund: vi.fn(),
  getPlanningAssets: vi.fn(),
}));

vi.mock("@/services/subscriptions", () => ({
  advanceRecurringSubscription: vi.fn(),
  createManualRecurringSubscription: vi.fn(),
  listRecurringSubscriptions: vi.fn(),
  updateRecurringSubscriptionStatus: vi.fn(),
}));

import { PlannerPage } from "@/routes/_authenticated/planner";
import { SubscriptionsPage } from "@/routes/_authenticated/subscriptions";

describe("planning pages", () => {
  it("renders saved scenario controls and the festival fund templates", () => {
    const html = renderToStaticMarkup(createElement(PlannerPage));
    expect(html).toContain("Saved scenarios");
    expect(html).toContain("Diwali plan");
    expect(html).toContain("Save scenario");
    expect(html).toContain("Diwali template");
  });

  it("renders recurring subscription details and payment controls", () => {
    const html = renderToStaticMarkup(createElement(SubscriptionsPage));
    expect(html).toContain("Recurring subscriptions");
    expect(html).toContain("Electricity");
    expect(html).toContain("Mark paid");
    expect(html).toContain("Add a recurring payment");
  });
});
