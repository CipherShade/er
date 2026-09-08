-- Align the physical audit_logs.metadata column with the Prisma schema.
-- The 0002 migration created the column as JSONB; this migration guarantees the
-- type even for databases bootstrapped via `prisma db push` from an older schema
-- where Prisma declared it as String (Text). Previously written values were
-- JSON-encoded strings, so an explicit cast is safe.
ALTER TABLE "audit_logs"
    ALTER COLUMN "metadata" DROP DEFAULT,
    ALTER COLUMN "metadata" TYPE JSONB USING "metadata"::jsonb;