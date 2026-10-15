# FamilyBudget Progress Tracker

## Baseline

- **Recorded:** 2026-10-14
- **Baseline HEAD:** `b7a8180` — Add planning, approvals, story, and notifications

| Check              | Baseline result  |
| ------------------ | ---------------- |
| `npx tsc --noEmit` | Pass             |
| `npm run lint`     | Pass             |
| `npm test`         | 133 tests passed |
| `npm run build`    | Pass             |

## Roadmap completion

- [x] **A — Configuration and baseline:** model defaults, AI environment documentation, smoke command, and baseline quality gate.
- [x] **B — AI Coach:** scoped coach tools and conversation storage, amount verification, permissions, UI, and security/architecture coverage.
- [x] **C — Planner and planning gaps:** family-scoped scenario CRUD and activity, sinking-fund templates, set-aside/shortfall math, and a shared-spending health trend.
- [x] **D — Notifications and subscriptions:** user-owned preferences, deduplicated scheduled notifications, and recurring candidates derived from shared expenses.
- [x] **E — Export, offline queue, and PWA:** scoped/rate-limited server CSV, idempotent create, family/user-scoped IndexedDB queue and sync status, cache versioning, and auth/API cache exclusions.
- [x] **F — UX polish:** navigation-only Ctrl/Cmd+K palette, light/dark/system preference, voice transcript-to-draft flow, and keyboard/label/responsive UI support.
- [x] **G — Hardening, deployment, and docs:** patched production dependencies, architecture guards, non-root health-checked Docker runtime, Render web/cron blueprint, PostgreSQL CI workflow, deterministic 400-expense seed, README, and five operational/technical guides.

## Decisions and known limitations

- The Postgres-backed rate limiter remains skipped per the original decision; current login, AI, and export limits are in-memory and are not shared across replicas.
- Offline expense drafts use unencrypted browser IndexedDB, scoped to the active user and family.
- Voice recognition depends on browser/device support; transcripts still pass through the normal parser and should be reviewed.
- No additional Prisma migrations were needed in this completion pass: the required scenario, recurring-pattern, notification, and client-request-id schema was already present.
- The Docker image could not be built in this environment because Docker Desktop's engine was unavailable. The Dockerfile and Render configuration were reviewed and formatted.

## Final quality gate

| Check                  | Result                  |
| ---------------------- | ----------------------- |
| Full tests             | 145 passed, twice       |
| TypeScript             | Pass                    |
| ESLint                 | Pass, no warnings       |
| Production build       | Pass                    |
| `npm audit --omit=dev` | Pass, 0 vulnerabilities |

## Completion record

| Step | Date                        | Notes                                                                         |
| ---- | --------------------------- | ----------------------------------------------------------------------------- |
| A–B  | Before this completion pass | Present in baseline branch.                                                   |
| C–G  | 2026-10-15                  | Implemented and verified; see final quality gate and known limitations above. |
