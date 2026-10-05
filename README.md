# FamilyBudget

FamilyBudget is a family budgeting app built with TanStack Start, React 19, TypeScript, Tailwind CSS, Prisma, PostgreSQL, Zod, and Recharts.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `DATABASE_URL_TEST`, and a random `JWT_SECRET` of at least 32 characters.
3. Generate Prisma Client and apply migrations:

   ```sh
   npx prisma generate
   npx prisma migrate deploy
   ```

4. Start the app with `npm run dev`.

Use PostgreSQL for both URLs and keep the test database separate from development data. Create the test database once before running tests:

```sql
CREATE DATABASE family_budget_test;
```

Set `DATABASE_URL_TEST` to that database. The Vitest global setup refuses a URL that resolves to the same database as `DATABASE_URL`, applies migrations once, and the integration suite truncates its tables between cases.

## Architecture and security

- PostgreSQL via Prisma is the only data layer.
- Registration creates a user, family, OWNER membership, and the eight default categories in one transaction.
- Login and registration validate input on the server. Passwords use bcryptjs with cost 12. Login failures are rate limited in memory to five failures per email and IP per 15 minutes; this needs Redis for multi-instance deployments.
- Auth uses a signed, seven-day session cookie with `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Set `SESSION_COOKIE_NAME` to a valid cookie name and provide a `JWT_SECRET` of at least 32 characters. State-changing server functions reject missing or mismatched `Origin` headers; set `APP_ORIGIN` to the public origin in production.
- Server functions resolve the user and their family membership from the cookie. Family, member, expense, budget, category, and report reads/writes are scoped to that membership. Roles are OWNER, ADMIN, MEMBER, and VIEWER.
- Money is stored as integer paise. Inputs reject non-positive values and more than two decimal places; display values are formatted in Indian Rupees.
- Categories are stored per family and can be created, renamed, recolored, and archived by OWNER and ADMIN members.

## Member management

The Members page shows each household member's role, join date, and most recent expense activity. OWNER can assign ADMIN, MEMBER, or VIEWER; ADMIN can assign MEMBER or VIEWER and can only change/remove MEMBER or VIEWER accounts. No role-change action can create or modify an OWNER. An OWNER transfers ownership by typing the exact family name; the previous owner becomes ADMIN. Other members can leave, while an OWNER must transfer ownership first.

Removal and leaving preserve historical expense attribution: the expense's member reference is cleared and its display name is snapshotted, so history appears as “Former member (Name)”. Deleted members' pending invites remain valid and show the creator's current role or “REMOVED”; OWNER/ADMIN can still revoke them. Users removed from a family lose access on their next server request. They can create a new family or accept an invite while signed in. A unique membership constraint keeps each account in at most one family.

Create reviewed migrations for schema development using `npx prisma migrate dev --name <description>`. Do not use `prisma db push` for deployed environments.

## Checks

```sh
npm run build
npm run lint
npm test
npx tsc --noEmit
```

## Deploy to Render

This project builds with Nitro's `node-server` preset and uses the standard Prisma Client. The health check at `/api/health` returns HTTP 200 when PostgreSQL is reachable and HTTP 503 otherwise.

1. Create a Render **Web Service** from this repository and select **Docker** as the runtime. Render builds from the included `Dockerfile`.
2. Add a PostgreSQL database in Render and set these service environment variables:
   - `DATABASE_URL`: Render's internal PostgreSQL connection string.
   - `JWT_SECRET`: a strong random secret with at least 32 characters.
   - `APP_ORIGIN`: the public HTTPS origin, for example `https://familybudget.onrender.com`.
   - `NODE_ENV`: `production`.
   - `SESSION_COOKIE_NAME`: optional; defaults to `fb_session`.
3. Deploy. The container runs `prisma migrate deploy` once at startup before launching the Node server; database migrations are not run per request.
4. Check `https://<your-service>.onrender.com/api/health` after deployment.

For a local production smoke check, build with `npm run build`, set the production environment variables, run `npx prisma migrate deploy`, and start with `npm run start`.

## Data migration note

For a legacy PostgreSQL database using the former Float and text fields, first create a separate target database and apply the current migrations to it. Set `DATABASE_URL_LEGACY` to the old database and `DATABASE_URL` to the migrated target, then review a dry run before importing:

```sh
node --experimental-strip-types scripts/migrate-legacy-data.ts --dry-run
node --experimental-strip-types scripts/migrate-legacy-data.ts
```

The importer rounds rupees to paise, maps category names per family, matches member names case-insensitively, and leaves unmatched members null while reporting counts. Keep backups of both databases. The source and target need matching User and Family IDs; this script does not migrate accounts or reconstruct those records.
