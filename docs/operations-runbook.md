# Operations runbook

## Before a deployment

1. Review the release diff and Prisma migration SQL. Verify changes are additive or have an explicit data-migration and rollback strategy.
2. Take a PostgreSQL backup using the managed database's snapshot facility or `pg_dump`. Store it encrypted and access-controlled, outside the application host.
3. Confirm the latest backup is restorable by restoring it to a separate database and checking application connectivity.
4. Verify CI passed for lint, TypeScript, tests, and production build. Do not deploy if a migration is unreviewed or CI is failing.

Example custom-format backup and restore:

```sh
pg_dump --format=custom --no-owner --file=familybudget-predeploy.dump "$DATABASE_URL"
createdb familybudget_restore_check
pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" familybudget-predeploy.dump
```

`createdb` is only an example for a local PostgreSQL server; use your provider's database creation and restore process for hosted databases. Never put database URLs or dump files in Git.

## Deploy and verify

Render applies Prisma migrations before starting the app and cron commands. After deployment:

1. Request `GET /api/health`; require HTTP 200, `status: "ok"`, `database: "connected"`, and `migrations.status: "up_to_date"`.
2. Verify the reported version matches the intended release and `migrations.latestApplied` is the expected migration.
3. Check the Render web logs for startup errors and both scheduled jobs for successful completion.
4. Exercise sign-in, one shared expense read, a report/export, and notification preferences with a non-production test account where possible.
5. Confirm the service remains healthy through the normal observation window; watch database connection errors, 5xx rates, cron failures, and AI spend if AI is enabled.

Server error logs carry a generated request ID and sanitized error type/status metadata. Use the request ID to correlate server and proxy logs; logs intentionally omit exception text and stack traces.

## Roll back

1. If the new application version is unhealthy, roll back the service image/release in Render and confirm `/api/health` and smoke checks recover.
2. Do not assume rolling back application code reverses a database migration. This project does not automatically roll back migrations.
3. Prefer a forward-fix for additive, backward-compatible migrations. For an incompatible schema/data change, stop writes if necessary, restore the pre-deployment backup into a separate database, validate it, then deliberately switch the service connection to that restored database.
4. Coordinate web and cron services when changing database connections. Keep the failed database and logs for diagnosis until the restore is verified.
5. Record the release version, migration state, backup identifier, recovery actions, and follow-up work in the operational incident record.

## Restore test

Periodically restore a recent encrypted backup to an isolated database, apply only the documented recovery steps, and verify health plus representative household records. Never test a restore over the live database.
