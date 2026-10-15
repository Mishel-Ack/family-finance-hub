# Test plan

Run the project's checks from the repository root:

```sh
npx prisma generate
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Integration tests require two separate PostgreSQL databases: `DATABASE_URL` and `DATABASE_URL_TEST`. The test global setup refuses to run against the same database as development, applies migrations to the test database, and resets test data between cases.

Coverage includes:

- Authentication, role checks, family isolation, origin validation, and private-expense visibility.
- Expense validation, smart-entry parsing, split arithmetic, idempotent writes, and server-function security.
- Coach scope and amount verification; planner scenario permissions and calculation boundaries.
- Notification preferences/deduplication, shared-only recurring detection, and health analytics.
- CSV escaping, rate limiting, service architecture guards, and deterministic demo seed behavior.

CI runs lint, TypeScript, the complete test suite, and the production build against PostgreSQL 16.
