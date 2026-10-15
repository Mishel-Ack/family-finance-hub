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
- Deterministic six-month planning backtest metrics and seeded outlier recall; see the test output for measured fixture MAE/MAPE values (these are not production guarantees).
- Goal-feasibility checks ensure private expenses are excluded and capacity is withheld until shared-spending history covers all three complete months.

CI runs lint, TypeScript, the complete test suite, and the production build against PostgreSQL 16.

To inspect representative local PostgreSQL query plans after applying migrations and seeding the demo family, run `npm run db:explain`. The script is read-only, requires a local database URL, and reports planning/execution time, buffer counts, and selected scan/index nodes for shared-expense, activity-feed, and unread-notification reads. Run it against the same local seed before and after query or index changes; PostgreSQL may choose sequential scans for small tables. Do not treat one laptop measurement as a production service-level guarantee.
