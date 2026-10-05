import { createServerFn } from "@tanstack/react-start";
import { requireMember } from "@/lib/authz";
import { activityListSchema, listActivity, type ActivityFilter } from "@/lib/activity-queries";

export const listActivityFn = createServerFn({ method: "GET" })
  .validator(activityListSchema)
  .handler(async ({ data }) => {
    const auth = await requireMember("activity:read");
    return listActivity(auth, data);
  });

export function listActivityPage(input: {
  cursor?: string;
  limit?: number;
  memberId?: string;
  type?: ActivityFilter;
}) {
  return listActivityFn({ data: input });
}
