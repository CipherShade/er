-- ============================================================
-- Migration: 0001_init
-- Project:   Educational Center ERP (Arabic-First, RTL)
-- Database:  PostgreSQL 15+
-- ============================================================

-- ─── Extensions ─────────────────────────────────────────────
-- pg_trgm: enables GIN trigram similarity indexes for fast Arabic name search
-- unaccent: available for future Latin diacritic stripping if needed
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
-- pgcrypto provides gen_random_uuid() used by UUID default generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ──────────────────────────────────────────────────
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RECEPTIONIST');
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'VODAFONE_CASH', 'INSTAPAY');
CREATE TYPE "AttendanceStatus" AS ENUM ('PAID', 'EXCUSED', 'VOID');
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'DISBURSED');
CREATE TYPE "SchoolType" AS ENUM ('GENERAL', 'LANGUAGES', 'AZHAR');

-- ============================================================
-- Arabic Phonetic Normalization Function
-- ============================================================
-- This IMMUTABLE function normalizes Arabic text for consistent
-- trigram-based fuzzy search at the lobby door during rush hours.
--
-- Transformations applied:
--   1. Strip Harakat / Tashkeel  (U+064B–U+065F, U+0670)
--   2. Strip Tatweel / Kashida   (U+0640)
--   3. Normalize Alef variants   (أ إ آ ا → ا)
--   4. Normalize Taa Marbouta    (ة → ه)
--   5. Normalize Alef Maksoura   (ى → ي)
--   6. Collapse multiple spaces  → single space
--   7. Lowercase (for Latin fallback parity)
--
-- Marked IMMUTABLE so PostgreSQL can use it in functional indexes.
-- ============================================================
CREATE OR REPLACE FUNCTION normalize_arabic(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  COALESCE(input_text, ''),
                  '[\u064B-\u065F\u0670]', '', 'g'   -- Strip Harakat/Tashkeel
                ),
                '\u0640', '', 'g'                     -- Strip Tatweel (Kashida)
              ),
              '[أإآا]', 'ا', 'g'                      -- Unify Alef variants
            ),
            'ة', 'ه', 'g'                             -- Taa Marbouta → Haa
          ),
          'ى', 'ي', 'g'                               -- Alef Maksoura → Yaa
        ),
        '\s+', ' ', 'g'                               -- Collapse whitespace
      )
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- ============================================================
-- Table 1: users  — Center Staff Accounts
-- ============================================================
CREATE TABLE "users" (
  "id"                 UUID          NOT NULL DEFAULT gen_random_uuid(),
  "username"           VARCHAR(50)   NOT NULL,
  "email"              VARCHAR(100),
  "password_hash"      VARCHAR(255)  NOT NULL,
  "full_name"          VARCHAR(100)  NOT NULL,
  "role"               "Role"        NOT NULL DEFAULT 'RECEPTIONIST',
  "phone_number"       VARCHAR(20),
  "preferred_language" VARCHAR(5)    NOT NULL DEFAULT 'ar',
  "is_active"          BOOLEAN       NOT NULL DEFAULT TRUE,
  "created_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "users_pkey"           PRIMARY KEY ("id"),
  CONSTRAINT "users_username_key"   UNIQUE ("username"),
  CONSTRAINT "users_email_key"      UNIQUE ("email"),
  CONSTRAINT "users_lang_check"     CHECK ("preferred_language" IN ('ar', 'en'))
);

-- ============================================================
-- Table 2: rooms  — Classrooms & Lecture Halls
-- ============================================================
CREATE TABLE "rooms" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "name"       VARCHAR(50)  NOT NULL,
  "capacity"   INTEGER      NOT NULL,
  "floor"      VARCHAR(20),
  "is_active"  BOOLEAN      NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "rooms_pkey"         PRIMARY KEY ("id"),
  CONSTRAINT "rooms_name_key"     UNIQUE ("name"),
  CONSTRAINT "rooms_capacity_chk" CHECK ("capacity" > 0)
);

-- ============================================================
-- Table 3: teachers  — Tutors / Instructors
-- ============================================================
CREATE TABLE "teachers" (
  "id"                 UUID           NOT NULL DEFAULT gen_random_uuid(),
  "full_name"          VARCHAR(100)   NOT NULL,
  "search_name"        VARCHAR(100)   NOT NULL,
  "phone_number"       VARCHAR(20)    NOT NULL,
  "subject"            VARCHAR(50)    NOT NULL,
  "default_center_fee" DECIMAL(10,2)  NOT NULL,
  "assistant_name"     VARCHAR(100),
  "assistant_phone"    VARCHAR(20),
  "is_active"          BOOLEAN        NOT NULL DEFAULT TRUE,
  "created_at"         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT "teachers_pkey"          PRIMARY KEY ("id"),
  CONSTRAINT "teachers_fee_chk"       CHECK ("default_center_fee" >= 0)
);

-- ============================================================
-- Table 4: students  — Student Master Directory
-- ============================================================
CREATE TABLE "students" (
  "id"             UUID          NOT NULL DEFAULT gen_random_uuid(),
  "student_code"   VARCHAR(30)   NOT NULL,
  "full_name"      VARCHAR(150)  NOT NULL,
  "search_name"    VARCHAR(150)  NOT NULL,
  "student_phone"  VARCHAR(20),
  "guardian_phone" VARCHAR(20)   NOT NULL,
  "academic_stage" VARCHAR(50)   NOT NULL,
  "school_type"    "SchoolType"  NOT NULL DEFAULT 'GENERAL',
  "notes"          TEXT,
  "created_at"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "students_pkey"           PRIMARY KEY ("id"),
  CONSTRAINT "students_code_key"       UNIQUE ("student_code")
);

-- ============================================================
-- Table 5: sessions  — Scheduled Class Instances
-- ============================================================
CREATE TABLE "sessions" (
  "id"                    UUID            NOT NULL DEFAULT gen_random_uuid(),
  "teacher_id"            UUID            NOT NULL,
  "room_id"               UUID            NOT NULL,
  "title"                 VARCHAR(150)    NOT NULL,
  "academic_stage"        VARCHAR(50)     NOT NULL,
  "start_time"            TIMESTAMPTZ     NOT NULL,
  "end_time"              TIMESTAMPTZ     NOT NULL,
  "session_price"         DECIMAL(10,2)   NOT NULL,
  "center_fee_per_student" DECIMAL(10,2)  NOT NULL,
  "status"                "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
  "created_by"            UUID            NOT NULL,
  "created_at"            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT "sessions_pkey"            PRIMARY KEY ("id"),
  CONSTRAINT "sessions_price_chk"       CHECK ("session_price" > 0),
  CONSTRAINT "sessions_fee_chk"         CHECK ("center_fee_per_student" >= 0),
  CONSTRAINT "sessions_time_chk"        CHECK ("end_time" > "start_time"),
  CONSTRAINT "sessions_teacher_fkey"    FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id"),
  CONSTRAINT "sessions_room_fkey"       FOREIGN KEY ("room_id")    REFERENCES "rooms"("id"),
  CONSTRAINT "sessions_creator_fkey"    FOREIGN KEY ("created_by") REFERENCES "users"("id")
);

-- ============================================================
-- Table 6: shift_registers  — Per-Desk Cash Drawer Sessions
-- ============================================================
CREATE TABLE "shift_registers" (
  "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
  "receptionist_id"     UUID          NOT NULL,
  "desk_identifier"     VARCHAR(50)   NOT NULL,
  "opened_at"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "closed_at"           TIMESTAMPTZ,
  "opening_cash"        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "actual_cash_counted" DECIMAL(10,2),
  "expected_cash"       DECIMAL(10,2),
  "cash_variance"       DECIMAL(10,2),
  "status"              "ShiftStatus" NOT NULL DEFAULT 'OPEN',
  "closing_notes"       TEXT,

  CONSTRAINT "shift_registers_pkey"              PRIMARY KEY ("id"),
  CONSTRAINT "shift_registers_receptionist_fkey" FOREIGN KEY ("receptionist_id") REFERENCES "users"("id")
);

-- ============================================================
-- Table 7: attendances  — Door Check-In & Payment Records
-- ============================================================
CREATE TABLE "attendances" (
  "id"                UUID              NOT NULL DEFAULT gen_random_uuid(),
  "session_id"        UUID              NOT NULL,
  "student_id"        UUID              NOT NULL,
  "receptionist_id"   UUID              NOT NULL,
  "shift_register_id" UUID              NOT NULL,
  "check_in_time"     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  "amount_paid"       DECIMAL(10,2)     NOT NULL,
  "change_owed"       DECIMAL(10,2)     NOT NULL DEFAULT 0.00,
  "payment_method"    "PaymentMethod"   NOT NULL,
  "payment_reference" VARCHAR(100),
  "status"            "AttendanceStatus" NOT NULL DEFAULT 'PAID',

  CONSTRAINT "attendances_pkey"             PRIMARY KEY ("id"),
  CONSTRAINT "attendances_amount_chk"       CHECK ("amount_paid" >= 0),
  CONSTRAINT "attendances_change_chk"       CHECK ("change_owed" >= 0),
  -- Concurrency guard: exactly 1 check-in per student per session (across all desks)
  CONSTRAINT "uq_attendance_session_student" UNIQUE ("session_id", "student_id"),
  CONSTRAINT "attendances_session_fkey"     FOREIGN KEY ("session_id")        REFERENCES "sessions"("id"),
  CONSTRAINT "attendances_student_fkey"     FOREIGN KEY ("student_id")        REFERENCES "students"("id"),
  CONSTRAINT "attendances_receptionist_fkey" FOREIGN KEY ("receptionist_id")  REFERENCES "users"("id"),
  CONSTRAINT "attendances_shift_fkey"       FOREIGN KEY ("shift_register_id") REFERENCES "shift_registers"("id")
);

-- ============================================================
-- Table 8: session_reconciliations  — Lobby vs. In-Hall Count
-- ============================================================
CREATE TABLE "session_reconciliations" (
  "id"                   UUID        NOT NULL DEFAULT gen_random_uuid(),
  "session_id"           UUID        NOT NULL,
  "lobby_count"          INTEGER     NOT NULL,
  "assistant_count"      INTEGER     NOT NULL,
  "discrepancy"          INTEGER     NOT NULL,
  "reconciled_headcount" INTEGER     NOT NULL,
  "resolution_notes"     TEXT,
  "reconciled_by"        UUID        NOT NULL,
  "reconciled_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "session_reconciliations_pkey"        PRIMARY KEY ("id"),
  CONSTRAINT "session_reconciliations_session_key" UNIQUE ("session_id"),
  CONSTRAINT "session_reconciliations_lobby_chk"   CHECK ("lobby_count" >= 0),
  CONSTRAINT "session_reconciliations_asst_chk"    CHECK ("assistant_count" >= 0),
  CONSTRAINT "session_reconciliations_head_chk"    CHECK ("reconciled_headcount" >= 0),
  CONSTRAINT "session_reconciliations_session_fkey" FOREIGN KEY ("session_id")    REFERENCES "sessions"("id"),
  CONSTRAINT "session_reconciliations_user_fkey"   FOREIGN KEY ("reconciled_by") REFERENCES "users"("id")
);

-- ============================================================
-- Table 9: session_settlements  — Teacher Financial Payouts
-- ============================================================
CREATE TABLE "session_settlements" (
  "id"                     UUID             NOT NULL DEFAULT gen_random_uuid(),
  "session_id"             UUID             NOT NULL,
  "reconciliation_id"      UUID             NOT NULL,
  "disbursed_from_shift_id" UUID,
  "reconciled_headcount"   INTEGER          NOT NULL,
  "session_price"          DECIMAL(10,2)    NOT NULL,
  "center_fee_per_student" DECIMAL(10,2)    NOT NULL,
  "total_revenue"          DECIMAL(10,2)    NOT NULL,
  "center_revenue"         DECIMAL(10,2)    NOT NULL,
  "teacher_payout"         DECIMAL(10,2)    NOT NULL,
  "payout_method"          "PaymentMethod"  NOT NULL DEFAULT 'CASH',
  "recipient_name"         VARCHAR(100)     NOT NULL,
  "status"                 "SettlementStatus" NOT NULL DEFAULT 'DISBURSED',
  "created_by"             UUID             NOT NULL,
  "settled_at"             TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT "session_settlements_pkey"            PRIMARY KEY ("id"),
  CONSTRAINT "session_settlements_session_key"     UNIQUE ("session_id"),
  CONSTRAINT "session_settlements_reconcil_key"    UNIQUE ("reconciliation_id"),
  CONSTRAINT "session_settlements_session_fkey"    FOREIGN KEY ("session_id")            REFERENCES "sessions"("id"),
  CONSTRAINT "session_settlements_reconcil_fkey"   FOREIGN KEY ("reconciliation_id")     REFERENCES "session_reconciliations"("id"),
  CONSTRAINT "session_settlements_shift_fkey"      FOREIGN KEY ("disbursed_from_shift_id") REFERENCES "shift_registers"("id"),
  CONSTRAINT "session_settlements_creator_fkey"    FOREIGN KEY ("created_by")            REFERENCES "users"("id")
);

-- ============================================================
-- Table 10: expenses  — Petty Cash & Operating Outlays
-- ============================================================
CREATE TABLE "expenses" (
  "id"                UUID          NOT NULL DEFAULT gen_random_uuid(),
  "shift_register_id" UUID,
  "category"          VARCHAR(50)   NOT NULL,
  "amount"            DECIMAL(10,2) NOT NULL,
  "payment_method"    "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "description"       VARCHAR(255)  NOT NULL,
  "created_by"        UUID          NOT NULL,
  "created_at"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "expenses_pkey"        PRIMARY KEY ("id"),
  CONSTRAINT "expenses_amount_chk"  CHECK ("amount" > 0),
  CONSTRAINT "expenses_shift_fkey"  FOREIGN KEY ("shift_register_id") REFERENCES "shift_registers"("id"),
  CONSTRAINT "expenses_creator_fkey" FOREIGN KEY ("created_by")       REFERENCES "users"("id")
);

-- ============================================================
-- Performance Indexes
-- ============================================================

-- ── Arabic Phonetic Name Search (GIN Trigram) ──────────────
-- These functional GIN indexes allow sub-15ms fuzzy Arabic name
-- lookups using pg_trgm similarity, even with Alef / Taa Marbouta
-- / diacritic variants in the query string.
CREATE INDEX "idx_students_name_trgm"
  ON "students" USING gin (normalize_arabic("full_name") gin_trgm_ops);

CREATE INDEX "idx_teachers_name_trgm"
  ON "teachers" USING gin (normalize_arabic("full_name") gin_trgm_ops);

-- ── Student Quick-Lookup Indexes (Code / Phone) ────────────
CREATE INDEX "idx_students_code"           ON "students" ("student_code");
CREATE INDEX "idx_students_phone"          ON "students" ("student_phone");
CREATE INDEX "idx_students_guardian_phone" ON "students" ("guardian_phone");

-- ── Active / Starting-Soon Sessions (Reception Dashboard) ──
-- Partial index limits scanned rows to only live sessions.
CREATE INDEX "idx_sessions_active"
  ON "sessions" ("status", "start_time", "end_time")
  WHERE "status" IN ('SCHEDULED', 'ACTIVE');

-- ── Attendance Fast Lookups ─────────────────────────────────
CREATE INDEX "idx_attendances_session"       ON "attendances" ("session_id");
CREATE INDEX "idx_attendances_student"       ON "attendances" ("student_id");
CREATE INDEX "idx_attendances_shift_payment" ON "attendances" ("shift_register_id", "payment_method");

-- ── Open Shift Register Lookup by Receptionist ─────────────
-- Partial index only covers OPEN registers — minimizes index size.
CREATE INDEX "idx_shift_registers_open"
  ON "shift_registers" ("receptionist_id", "status")
  WHERE "status" = 'OPEN';

-- ── Session Reconciliation & Settlement ────────────────────
CREATE INDEX "idx_session_reconciliations_session" ON "session_reconciliations" ("session_id");
CREATE INDEX "idx_session_settlements_session"     ON "session_settlements" ("session_id");
CREATE INDEX "idx_session_settlements_shift"       ON "session_settlements" ("disbursed_from_shift_id");

-- ── Expenses by Shift ──────────────────────────────────────
CREATE INDEX "idx_expenses_shift" ON "expenses" ("shift_register_id");
