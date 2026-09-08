-- 1) Support under-payment tracking on the attendance record.
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';

-- 2) Replace the catch-all compound unique constraint with a PARTIAL unique
--    index over LIVE check-ins only. VOIDed check-ins are excluded so a
--    mistaken door check-in can be corrected by checking the student back in.
ALTER TABLE "attendances" DROP CONSTRAINT IF EXISTS "uq_attendance_session_student";
CREATE UNIQUE INDEX IF NOT EXISTS "uq_attendance_session_student_nonvoid"
    ON "attendances" ("session_id", "student_id")
    WHERE "status" <> 'VOID';