# Deployment

## Render blueprint

The root `render.yaml` defines one Docker web service, a PostgreSQL database, and scheduled insight and notification jobs. Set the `APP_ORIGIN` prompt to the exact public HTTPS origin. The blueprint keeps AI globally disabled by default; configure the provider key and enable AI only after setting the desired spending limits.

The container applies reviewed Prisma migrations before starting the web process. Cron commands also deploy migrations before running, which is safe because Prisma records applied migrations. `/api/health` reports the build commit and latest applied migration; it returns 503 if PostgreSQL is unavailable, the expected migration is missing, or an unfinished migration is recorded.

## Docker

Build and run the image with a production `DATABASE_URL`, `JWT_SECRET`, and `APP_ORIGIN`:

```sh
docker build -t familybudget .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="replace-with-a-random-secret-at-least-32-chars" \
  -e APP_ORIGIN="https://familybudget.example" \
  familybudget
```

The runtime is non-root, exposes port 3000, and performs a health check. Do not bake `.env` files or production credentials into an image.

## Operations

Back up PostgreSQL before deployment and schema changes. Monitor `/api/health`, sanitized application logs, cron completion, and AI provider spend. Login, invite, AI, and export rate limits are backed by PostgreSQL and shared across web replicas. Use [the operations runbook](./operations-runbook.md) for deploy, restore, and rollback procedures.
