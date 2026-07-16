# Server migrations

Plain, idempotent SQL migrations for the live PostgreSQL database. The project has
no Sequelize-CLI migration framework, so these are hand-run `.sql` files. Every file
is written to be safe to run more than once (`ADD COLUMN IF NOT EXISTS`, no drops).

## Running a migration

From the `server/` directory, using the same credentials as `.env`
(`DB_HOST` / `DB_PORT` / `DB_USER` / `DB_NAME`):

```bash
# PowerShell / Windows (psql from the PostgreSQL install)
$env:PGPASSWORD = "<DB_PWD>"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" `
    -h localhost -p 5432 -U postgres -d flowguard `
    -f migrations/20260714_sync_object_detection_schema.sql
```

```bash
# bash
PGPASSWORD='<DB_PWD>' psql -h localhost -p 5432 -U postgres -d flowguard \
    -f migrations/20260714_sync_object_detection_schema.sql
```

Each migration wraps its changes in a transaction, so a failure rolls back cleanly
and leaves the database untouched.

## Migrations

| File | What it does |
|------|--------------|
| `20260714_sync_object_detection_schema.sql` | Adds the two Object Detection columns that existed in the Sequelize models but not in the live DB after the group-final merge: `monitoring_zones.detection_type` and `detection_alerts.incident_log_id`. Fixes the 500s on `GET /api/zones` and `GET /api/cameras`. |
