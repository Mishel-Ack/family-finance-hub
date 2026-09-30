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

Use PostgreSQL for both URLs and keep the test database separate from development data. The test suite currently covers money calculations, permission rules, and session token behavior. PostgreSQL service-isolation integration tests are still outstanding.

## Architecture and security

- PostgreSQL via Prisma is the only data layer.
- Registration creates a user, family, OWNER membership, and the eight default categories in one transaction.
- Login and registration validate input on the server. Passwords use bcryptjs with cost 12. Login failures are rate limited in memory to five failures per email and IP per 15 minutes; this needs Redis for multi-instance deployments.
- Auth uses a signed, seven-day `fb_session` cookie with `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Signing uses Web Crypto. `JWT_SECRET` has no fallback and the server fails to start without it.
- Server functions resolve the user and their family membership from the cookie. Family, member, expense, budget, category, and report reads/writes are scoped to that membership. Roles are OWNER, ADMIN, MEMBER, and VIEWER.
- Money is stored as integer paise. Inputs reject non-positive values and more than two decimal places; display values are formatted in Indian Rupees.
- Categories are stored per family and can be created, renamed, recolored, and archived by OWNER and ADMIN members.

Create reviewed migrations for schema development using `npx prisma migrate dev --name <description>`. Do not use `prisma db push` for deployed environments.

## Checks

```sh
npm run build
npm run lint
npm test
npx tsc --noEmit
```

## Deployment note

The Vite/Nitro preset currently produces a Cloudflare Worker build. The standard Prisma Client in this project is not a supported direct database client for Cloudflare Workers. Before deployment, use a Node.js runtime or configure Prisma's supported Workers approach with Accelerate or a compatible driver adapter and the required Worker environment bindings. Do not deploy this standard Prisma connection to Workers unchanged.

## Data migration note

The checked-in migration creates the hardened schema for a fresh database. The repository does not yet contain an upgrade migration that converts an older database's Float rupee amounts and string categories/member names into paise and relational category/member IDs. Back up existing data and complete that migration before applying this schema to a database containing legacy records.
