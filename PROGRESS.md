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

- Rate limits are stored in PostgreSQL and shared across replicas; only hashed keys, counts, and reset timestamps are persisted.
- Offline expense drafts use unencrypted browser IndexedDB, scoped to the active user and family.
- Voice recognition depends on browser/device support; transcripts still pass through the normal parser and should be reviewed.
- No additional Prisma migrations were needed in this completion pass: the required scenario, recurring-pattern, notification, and client-request-id schema was already present.
- The Docker image could not be built in this environment because Docker Desktop's engine was unavailable. The Dockerfile and Render configuration were reviewed and formatted.
- The later detailed-mission continuation adds a reviewed migration for confirmed recurring schedules (`intervalDays`, `nextExpectedAt`, and `typicalAmountPaise`); it has been applied to the local development and test databases.

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

## Detailed mission continuation (2026-10-15)

- [x] Replaced in-memory login, invite, AI, and export rate limits with atomic PostgreSQL updates; reused the already-migrated `RateLimitBucket` model, hashed identifiers, injectable test clock, concurrent-attempt coverage, and periodic cleanup.
- [x] Added server-generated request IDs, structured error metadata without exception messages/stacks, client error-reporting sanitization, and version/migration metadata in `/api/health`.
- [x] Verified the hardening slice: 22 focused tests, TypeScript, and ESLint pass.
- [x] Add budget-threshold and upcoming recurring-payment notifications, including recurring charge confirm/dismiss/manual management.
- [x] Complete export date ranges, privacy-safe export activity records, and a print-friendly report.
- [x] Expand command-palette actions and family/user-scoped expense search; add offline queue review, retry/discard, and preserve-or-discard sign-out choices.
- [x] Make goal-feasibility assumptions explicit; require shared spending in all three complete months before estimating savings capacity.
- [x] Expand deterministic demo fixtures and add a local-only read-only `EXPLAIN ANALYZE` tool.
- [x] Add operational post-deploy, backup, and rollback guidance; complete `FINAL_REPORT.md`.
- [x] Run the full 158-test suite twice, TypeScript, ESLint, Prisma generate/validate/migrate checks, production build, production dependency audit, and formatting checks.
- [x] Commit the verified feature slice locally as `23faa91`.
- [blocked] Push to `origin/fixes`: Git could not prompt for credentials, so `6c1bc3c` and `23faa91` remain local and are not published.

### Measured query-plan sample

On the local PostgreSQL test database with the 400-expense demo seed, `npm run db:explain` measured 0.382 ms for the shared-expense query (100 rows returned), 0.120 ms for the recent-activity query (21 rows), and 0.035 ms for unread notifications (2 rows). The expense query used an index scan; the 33-row activity and 2-row notification tables used sequential scans. This is a small local fixture, not a production performance guarantee.
