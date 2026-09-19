-- Fix: Drop the old single-column unique constraint on rooms.name
-- The schema now uses a composite unique constraint @@unique([tenantId, name])
ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_name_key" CASCADE;

-- Ensure the composite unique constraint exists
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tenant_id_name_key" UNIQUE ("tenant_id", "name");

