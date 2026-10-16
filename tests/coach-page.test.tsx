import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === "ai-availability") {
      return { data: { enabled: true, capped: false }, isLoading: false };
    }
    if (queryKey[0] === "coach-conversations") {
      return { data: [], isLoading: false };
    }
    return { data: null, isLoading: false };
  },
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/services/coach", () => ({
  listCoachConversations: vi.fn(),
  getCoachConversation: vi.fn(),
  askCoach: vi.fn(),
  deleteCoachConversation: vi.fn(),
}));

vi.mock("@/services/ai", () => ({
  getAiAvailability: vi.fn(),
}));

import { CoachPage } from "@/routes/_authenticated/coach";

describe("Coach page", () => {
  it("renders the conversation starter, financial questions, and accessible send control", () => {
    const html = renderToStaticMarkup(createElement(CoachPage));
    expect(html).toContain("AI Financial Coach");
    expect(html).toContain("Ask your family finances");
    expect(html).toContain("How much did our household spend this month?");
    expect(html).toContain('aria-label="Send message"');
    expect(html).toContain("All answers are grounded in verified household data.");
  });
});
