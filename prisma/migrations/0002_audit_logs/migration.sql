CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shift_register_id" UUID,
  "actor_id" UUID NOT NULL,
  "action" VARCHAR(50) NOT NULL,
  "entity_type" VARCHAR(50) NOT NULL,
  "entity_id" UUID,
  "amount" DECIMAL(10,2),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_shift_fkey" FOREIGN KEY ("shift_register_id") REFERENCES "shift_registers"("id"),
  CONSTRAINT "audit_logs_actor_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id")
);

CREATE INDEX "idx_audit_logs_shift_created" ON "audit_logs" ("shift_register_id", "created_at");
CREATE INDEX "idx_audit_logs_created" ON "audit_logs" ("created_at");