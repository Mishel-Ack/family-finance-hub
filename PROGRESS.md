# FamilyBudget – Progress Tracker

## Baseline (recorded before any changes)

**Date:** 2026-10-14  
**Git HEAD:** b7a8180 (Add planning, approvals, story, and notifications)

### Baseline Quality Gate

| Check           | Result                                      |
| --------------- | ------------------------------------------- |
| `tsc --noEmit`  | ✅ PASS (0 errors)                          |
| `npm run lint`  | ✅ PASS (0 warnings)                        |
| `npm test`      | ⏳ RUNNING (DB reachable at localhost:5432) |
| `npm run build` | ⏳ NOT YET RUN                              |

Baseline test results will be filled in once the run completes.

---

## Step Checklist

- [ ] **STEP A** – Configuration and baseline
  - [ ] Fix model defaults (AI_MODEL_VISION/COACH to `claude-sonnet-5-5`)
  - [ ] Add all AI_* variables to `.env.example` and README
  - [ ] Add `npm run ai:smoke` script
  - [ ] Record baseline tsc/lint/test/build
  - Commit: `step A: configuration and baseline`

- [ ] **STEP B** – AI Coach
  - [ ] Add `coach:use` action to permission matrix
  - [ ] Migration: CoachConversation + CoachMessage tables
  - [ ] Coach service with tools (get_spending_summary, get_budget_status, etc.)
  - [ ] Server functions: listConversations, getConversation, askCoachFn, deleteConversation
  - [ ] Number-verification logic (extract rupee amounts, verify against tool data)
  - [ ] UI: /coach route, conversation list, chat view, source cards
  - [ ] Tests: isolation, VIEWER policy, private expense isolation, etc.
  - [ ] Add new server functions to security test maps
  - [ ] Add architecture guard for CoachConversation/CoachMessage
  - Commit: `step B: AI coach`

- [ ] **STEP C** – Planner and planning gaps
  - [ ] Migration: Scenario table
  - [ ] Add `scenario:manage` action to matrix
  - [ ] Save/load/rename/delete scenarios in /planner UI
  - [ ] Activity entries for scenario create/delete
  - [ ] Sinking fund templates (Diwali, school fees, etc.)
  - [ ] Verify/fix monthly set-aside and shortfall math
  - [ ] Health score card with 6-month trend on dashboard
  - [ ] Tests: scenario permissions, set-aside math, shortfall
  - [ ] Optional: explain scenario AI button (marked optional per SKIP ORDER)
  - Commit: `step C: planner scenarios and planning gaps`

- [ ] **STEP D** – Notifications, subscriptions, reminders
  - [ ] Extend NotificationType enum by migration (MONTHLY_STORY_READY, FUND_OFF_TRACK, ANOMALY, MEMBER_JOINED, SETTLEMENT)
  - [ ] Migration: nullable unique `dedupeKey` per Notification
  - [ ] Server functions: get/update notification preferences
  - [ ] `src/services/notification-jobs.ts` + `npm run notifications:run` script
  - [ ] /subscriptions route: detected recurring merchants
  - [ ] RecurringPattern model (unique [familyId, merchantKey])
  - [ ] NotificationCenter UI: preferences panel, mark all read, unread badge
  - [ ] Tests: dedupe/idempotency, preferences, private leakage
  - Commit: `step D: notifications and subscriptions`

- [ ] **STEP E** – Export, offline queue, PWA
  - [ ] Server-side CSV export with injection escaping, UTF-8 BOM, rate limit
  - [ ] Migration: Expense.clientRequestId (idempotent create)
  - [ ] Offline queue: IndexedDB client-side, pending sync badge
  - [ ] PWA manifest: complete with maskable icons
  - [ ] Service worker: bump cache version, no auth responses cached
  - [ ] Tests: CSV escaping, export scope, idempotent create concurrency
  - Commit: `step E: export, offline queue, PWA`

- [ ] **STEP F** – UX polish
  - [ ] Command palette (cmdk, Ctrl+K)
  - [ ] Dark mode toggle (light/dark/system, localStorage)
  - [ ] Voice input verification (en-IN/hi-IN/gu-IN)
  - [ ] Accessibility pass (keyboard nav, focus traps, aria labels, 360px)
  - [ ] Tests: palette search scope, voice transcript yields drafts
  - Commit: `step F: UX polish`

- [ ] **STEP G** – Hardening, deployment, docs
  - [ ] Postgres-backed rate limiter (DECISION: marked as optional in SKIP ORDER)
  - [ ] `npm audit --omit=dev`
  - [ ] Architecture guard extensions for new models
  - [ ] Dockerfile hardening (non-root, healthcheck, migrate before start)
  - [ ] `render.yaml` with web + cron jobs
  - [ ] `.github/workflows/ci.yml`
  - [ ] Large seed (400 expenses, 6 months, recurring, outliers)
  - [ ] README update (full docs, ML metrics, env table)
  - [ ] `docs/` directory (architecture, ml-explained, test-plan, deployment, demo-script)
  - [ ] Final quality gate (tests x2, tsc, lint, build)
  - Commit: `step G: hardening, deployment, docs`

---

## Decisions Made (DEFAULT DECISIONS)

- Model IDs: `AI_MODEL_FAST=claude-haiku-4-5-20251001`, `AI_MODEL_VISION=AI_MODEL_COACH=claude-sonnet-5-5`
- No web-push (in-app only)
- No Anthropic SDK (keep fetch)
- No kids mode/allowance/quests/badges
- Offline queue: IndexedDB on-device, no encryption
- Coach: VIEWER may use read-only; conversations private per user
- Approval rule: OWNER/ADMIN cannot decide own request unless sole OWNER
- Rate limiter: in-memory for now (Postgres-backed is SKIP ORDER #5)
- AI off by default for new families (aiEnabled: false)
- Conservative monthly cap: 5,000,000 micros (~$5 USD equivalent)

---

## Known Gaps / Deviations

(to be filled as work progresses)

---

## Step Completion Log

| Step     | Date       | Files Changed | Migrations | Tests   | Notes |
| -------- | ---------- | ------------- | ---------- | ------- | ----- |
| Baseline | 2026-10-14 | —             | —          | Pending |       |
