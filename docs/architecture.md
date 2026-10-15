# Architecture

FamilyBudget uses TanStack Start server functions for authenticated application operations, React for the browser UI, Prisma for PostgreSQL access, and Zod for input validation.

## Request boundaries

1. A server function validates input and checks request origin when it changes state.
2. Authentication resolves the user and their current family membership from the signed session.
3. The permission matrix checks role-based access; record guards confirm that referenced categories, members, and records belong to the active family.
4. Shared/private expense reads go through `src/lib/expense-queries.ts`. Activity writes and sensitive notification creation also use their dedicated query helpers.
5. Responses expose only the fields needed by the client.

The application uses integer paise for storage and calculation. Do not introduce floating-point currency persistence.

## Family privacy

- Shared expenses are visible to authorized family members. A private expense is visible only to its creator.
- Shared analytics, health scores, recurring detection, planner history, and exports use shared expenses. Export can optionally include only the current user's private expenses.
- Conversation history for the AI Coach is per user, and saved planner scenarios and recurring records are scoped by family.
- Family membership is re-resolved on each server request, so removal revokes access without waiting for the session cookie to expire.

## Persistence and scheduled work

Prisma migrations are deployed before the web service starts. Render cron services run the same migrations before their commands; deployment migrations must remain safe to apply repeatedly.

- `npm run insights:recompute` calculates persisted family insights.
- `npm run notifications:run` creates deduplicated in-app notifications.
- Browser offline expense drafts are stored in IndexedDB, scoped by family and user, and synchronized through the idempotent expense-create endpoint.

## Runtime protections

The Docker image runs as the built-in non-root `node` user and probes `/api/health`. Authenticated responses are never cached by the service worker. Login and feature rate limits are currently in-memory; multiple application replicas do not share those counters.
