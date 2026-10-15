# Demo script

## Prepare

1. Start PostgreSQL locally and set `DATABASE_URL`, `DATABASE_URL_TEST`, and a random `JWT_SECRET` in `.env`.
2. Apply migrations and seed the deterministic demo household:

   ```sh
   npx prisma migrate deploy
   npm run seed:demo
   ```

3. Start `npm run dev`. The seed prints demo credentials in non-production environments; use the shared password it prints.

## Walkthrough

1. Open the dashboard to show shared spending, six-month health trend, and recent activity.
2. Add an expense using the regular form, smart text entry, or browser voice recognition; demonstrate pending sync only while offline.
3. Open Planner to compare a projection, save a scenario, and view sinking-fund targets.
4. Review subscriptions and notifications, then change personal in-app notification preferences.
5. Open the AI Coach only if a provider is configured and family AI is enabled.
6. Export shared expenses, optionally including the signed-in user's private expenses.

The optional `npm run seed:demo -- --large` creates 400 deterministic expenses spanning six calendar months, with recurring examples and outliers. Never seed production. Remote seeding is refused unless explicitly enabled, and production is always refused.
