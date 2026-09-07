# REST API & WebSocket Specification: Educational Center ERP

> This document describes the **actually implemented** API. It is derived from the route registration in `src/server/app.ts` and the route modules under `src/server/modules/`.

## 1. Overview & Conventions

### 1.1. Base URL & Protocol
- **Base URL:** `/api` (there is **no** `/api/v1` prefix).
- **Content-Type:** `application/json` (UTF-8, full Arabic text support).
- **Authentication:** JWT delivered in an `access_token` cookie (HTTP-only, signed, `SameSite=Lax`, `Secure` in production, max age derived from `JWT_EXPIRES_IN`).
- **Real-Time Protocol:** Socket.io (`/socket.io/`), same origin or a configured CORS origin.
- **Development proxy:** `vite.config.ts` proxies `/api` and `/socket.io` to `http://localhost:3000`.

### 1.2. Global Response Envelope
Every successful response returns `{ "success": true, "data": ... }`.

### 1.3. Global Error Envelope
Every failure returns a localized error structure:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE_ENUM",
    "message": "رسالة واضحة ومفهومة باللغة العربية.",
    "messageEn": "Human readable explanation in English.",
    "details": {}
  }
}
```

### 1.4. Validation, Auth & Rate Limiting
- Request bodies are validated with **Fastify JSON Schema** (`additionalProperties: false`). Invalid input → `400 VALIDATION_ERROR`.
- Every endpoint except `/api/auth/login`, `/api/auth/logout`, and `/api/health` requires authentication (`UNAUTHORIZED` / `FORBIDDEN`).
- In-memory, per-process rate limiters (in-memory fixed window). 429 → `RATE_LIMITED`. Defaults (per IP or per user):
  - `login`: 10/min — `POST /api/auth/login`
  - `checkIn`: 240/min — `POST /api/attendances/checkin`
  - `studentSearch`: 240/min — `GET /api/registry/students`
  - `financial`: 60/min — `POST /api/sessions/:id/reconcile`, `POST /api/sessions/:id/settle`, `POST /api/shifts/expenses`

---

## 2. Authentication & Session (`/api/auth`)

### 2.1. `POST /api/auth/login`
Public (rate-limited). Body: `{ "username": string, "password": string }`.
- On success sets cookie `access_token` and returns:
  ```json
  { "success": true, "data": { "user": { "id", "username", "fullName", "role", "preferredLanguage", "phoneNumber" } } }
  ```
- Errors: `401 INVALID_CREDENTIALS` (unknown user, inactive account, or wrong password — no separate deactivated error).

### 2.2. `POST /api/auth/logout`
No auth required. Clears the `access_token` cookie. Returns `{ "success": true, "data": null }`.

### 2.3. `GET /api/auth/me`
Auth required. Returns the current user profile:
```json
{ "success": true, "data": { "user": { "id", "username", "fullName", "role", "preferredLanguage", "phoneNumber" } } }
```

> Note: there is **no `/api/auth/preferences` endpoint** in the implementation.

---

## 3. Classrooms & Teachers (`/api/management`)

| Method & Path | Roles | Purpose |
| :--- | :--- | :--- |
| `GET /api/management/rooms` | any auth | List rooms ordered by name. Returns `{ rooms: [...] }`. |
| `POST /api/management/rooms` | ADMIN | Create room. Body `{ name, capacity, floor?, isActive? }` → `201 { room }`. Duplicate name → `409`. |
| `PATCH /api/management/rooms/:id` | ADMIN | Partial update → `200 { room }`. `404` if missing; `409` on duplicate name. |
| `DELETE /api/management/rooms/:id` | ADMIN | Delete → `200 { data: null }`. `409 RESOURCE_IN_USE` if referenced by sessions. |
| `GET /api/management/teachers` | any auth | List teachers. `defaultCenterFee` returned as a **string**. |
| `POST /api/management/teachers` | ADMIN | Body `{ fullName, phoneNumber, subject, defaultCenterFee, assistantName?, assistantPhone?, isActive? }` → `201`. Egyptian mobiles enforced (`010/011/012/015`). |
| `PATCH /api/management/teachers/:id` | ADMIN | Partial update → `200`. `404` if missing. |
| `DELETE /api/management/teachers/:id` | ADMIN | `200 { data: null }`. `409 RESOURCE_IN_USE` if referenced by sessions. |

---

## 4. Sessions & Scheduling (`/api/scheduling`)

| Method & Path | Roles | Purpose |
| :--- | :--- | :--- |
| `GET /api/scheduling/sessions?from=&to=` | any auth | List sessions (optional date window). Prices returned as strings. Includes `teacher { id, fullName, subject }` and `room { id, name, capacity }`. |
| `POST /api/scheduling/sessions` | ADMIN | Create session. Body `{ teacherId, roomId, title, academicStage, startTime, endTime, sessionPrice, centerFeePerStudent, status? }` → `201 { session }`. Rejects `end <= start`, `sessionPrice < centerFeePerStudent`, non-2dp money, inactive teacher/room, and **room or teacher overlap** → `409 SCHEDULE_CONFLICT`. |
| `PATCH /api/scheduling/sessions/:id` | ADMIN | Partial update with the same collision checks. `404` if missing. |
| `DELETE /api/scheduling/sessions/:id` | ADMIN | **Soft cancel** (`status = CANCELLED`). `409 SESSION_LOCKED` if already `COMPLETED`. |

### Lobby dashboard (active sessions)
`GET /api/attendances/sessions/active?deskFilter=` (in the attendances module) returns sessions that are `ACTIVE` or `SCHEDULED` starting within the next 30 minutes:
```json
{ "success": true, "data": { "sessions": [ {
  "id", "title", "academicStage",
  "teacher": { "id", "fullName", "subject" },
  "room": { "id", "name", "capacity" },
  "startTime", "endTime", "sessionPrice", "centerFeePerStudent",
  "currentLobbyCount", "status"
} ] } }
```
`deskFilter` accepts a comma-separated list of session IDs.

---

## 5. Students (`/api/registry`)

| Method & Path | Roles | Purpose |
| :--- | :--- | :--- |
| `GET /api/registry/students?search=&page=&limit=` | any auth (rate-limited) | Search by `searchName` (Arabic-normalized `contains`), `studentPhone`, `guardianPhone`, or `studentCode` (case-insensitive). Paginated: `{ students: [...], pagination: { page, limit, total, pages } }`. |
| `POST /api/registry/students` | ADMIN, RECEPTIONIST | Quick-add. Body `{ fullName, guardianPhone, academicStage, studentPhone?, schoolType?, notes? }` → `201 { student }`. `studentCode` auto-generated (`STU-00001`, …). `409 STUDENT_CODE_CONFLICT` on collision; Egyptian mobiles enforced. |
| `PATCH /api/registry/students/:id` | ADMIN, RECEPTIONIST | Partial update → `200`. `404` if missing. |
| `DELETE /api/registry/students/:id` | ADMIN | `200 { data: null }`. `409 STUDENT_IN_USE` if the student has attendance records. |

---

## 6. Desk Shift Registers & Expenses (`/api/shifts`)

### 6.1. `GET /api/shifts/current`
Auth required. Returns the requester's open shift with live financials, or `{ shift: null }` when none is open:
```json
{ "success": true, "data": { "shift": {
  "id", "receptionistId", "deskIdentifier", "openedAt", "closedAt",
  "openingCash", "actualCashCounted", "expectedCash", "cashVariance", "status", "closingNotes",
  "financials": {
    "totalCashCollected", "totalVodafoneCashCollected", "totalInstapayCollected",
    "totalGrossRevenue", "totalTeacherCashPayouts", "totalCashExpenses", "expectedCashInDrawer"
  }
} } }
```
Expected cash = opening + cash collected − cash teacher payouts − cash expenses. Digital collections are tracked separately and do not enter the drawer.

### 6.2. `POST /api/shifts/open`
Body `{ deskIdentifier, openingCash }` → `201 { shift }`. One open shift per user; otherwise `409 SHIFT_ALREADY_OPEN`.

### 6.3. `POST /api/shifts/close`
Body `{ actualCashCounted, closingNotes? }`. Computes `expectedCash` and `cashVariance`, closes and **locks** the shift. Returns the closed shift plus `totalVodafoneCash`, `totalInstapay`, and `financials`. Errors: `400 SHIFT_NOT_OPEN` when no open shift.

### 6.4. `POST /api/shifts/expenses`
Body `{ category, amount, paymentMethod, description }` → `201 { expense }`.
- `category` is a free-text string (max 50 chars; not an enum) and `amount` must be 2dp.
- `paymentMethod: CASH` requires an open shift (`400 SHIFT_NOT_OPEN`) and deducts from the drawer; mid-flight shift closure → `409 SHIFT_CLOSED`.
- Digital expenses are recorded without a linked drawer (`shiftRegisterId: null`).

---

## 7. Door Check-In & Attendance (`/api/attendances`)

### 7.1. `POST /api/attendances/checkin`
Core rush-hour check-in. Roles: ADMIN, RECEPTIONIST. Rate-limited (240/min). Body:
```json
{ "sessionId": "uuid", "studentId": "uuid", "paymentMethod": "CASH", "paymentReference": null, "amountPaid": null }
```
- `paymentMethod` ∈ `CASH | VODAFONE_CASH | INSTAPAY`. Digital methods **require** `paymentReference` (`400 PAYMENT_REFERENCE_REQUIRED`).
- Requires an open shift (`400 SHIFT_NOT_OPEN`); session must be `ACTIVE`/`SCHEDULED` (`404 SESSION_NOT_FOUND`, `400 SESSION_NOT_ACTIVE`); student must exist (`404 STUDENT_NOT_FOUND`); room capacity enforced (`400 SESSION_CAPACITY_REACHED`).
- Fee defaults to `sessions.sessionPrice`; if `amountPaid` exceeds it, `changeOwed` (باقي فلوس للطالب) is computed and stored.
- Concurrency: the write runs in a serializable transaction and is guarded by `UNIQUE (session_id, student_id)`. Duplicate → `409 DUPLICATE_CHECK_IN` (with `details.checkedInAt` / `details.deskIdentifier`); mid-flight shift closure → `409 SHIFT_CLOSED`.
- On success:
  ```json
  { "success": true, "data": {
      "attendance": { "id", "sessionId", "studentId", "studentName", "amountPaid", "changeOwed", "paymentMethod", "checkInTime", "deskIdentifier" },
      "newSessionLobbyCount": 69
  } }
  ```
- Broadcasts `attendance:checked_in` to the `center:lobby` room.

### 7.2. `GET /api/attendances/sessions/:sessionId/attendances?page=&limit=`
Auth required. Paginated list of check-ins for a session (student name/phones, `amountPaid`, `changeOwed`, `paymentMethod`, `checkInTime`, `deskIdentifier`).

---

## 8. Reconciliation (`POST /api/sessions/:id/reconcile`)

Roles: ADMIN, RECEPTIONIST. Rate-limited (financial). Body:
```json
{ "assistantCount": 70, "reconciledHeadcount": 70, "resolutionNotes": "..." }
```
- Computes `lobbyCount` from non-void attendance; `discrepancy = assistantCount - lobbyCount`.
- If `discrepancy != 0`, `resolutionNotes` (≥ 3 chars) is required → else `400 RECONCILIATION_REQUIRED`.
- Upserts one reconciliation per session (`UNIQUE session_id`). Completed sessions are locked → `409 SESSION_LOCKED`.
- Returns `{ reconciliation: { sessionId, lobbyCount, assistantCount, discrepancy, reconciledHeadcount, resolutionNotes, reconciledBy, reconciledAt } }`.
- No WebSocket broadcast is emitted by this endpoint.

---

## 9. Settlement & Teacher Payout (`POST /api/sessions/:id/settle`)

Roles: ADMIN, RECEPTIONIST. Rate-limited (financial). Body `{ payoutMethod, recipientName }`.
- Requires a reconciliation first (`400 RECONCILIATION_REQUIRED`) and an open shift (`400 SHIFT_NOT_OPEN`). Completed session → `409 SESSION_LOCKED`.
- Server-side math: `totalRevenue = reconciledHeadcount × sessionPrice`, `centerShare = reconciledHeadcount × centerFeePerStudent`, `teacherPayout = totalRevenue − centerShare`.
- Marks the session `COMPLETED` and the settlement `DISBURSED` (permanent lock), then audits `TEACHER_PAYOUT`.
- Returns `201 { settlement: { ..., centerShare, teacherPayout, payoutMethod, recipientName, disbursedFromDesk, settledAt, status } }`.

---

## 10. Reports & Audit (`/api/reports`)

### 10.1. `GET /api/reports/daily?date=YYYY-MM-DD`
Roles: ADMIN, RECEPTIONIST. Defaults to current UTC date. Uses UTC day boundaries. Returns:
```json
{ "success": true, "data": {
    "date", "totalAttendees", "centerNetRevenue", "teacherPayouts", "digitalCollections",
    "digitalCollectionsByMethod": { "vodafoneCash": 4500.00, "instapay": 4500.00 }
} }
```
Void attendance records are excluded. Bad date → `400 INVALID_REPORT_DATE`.

### 10.2. `GET /api/reports/shifts/:shiftId/audit?page=&limit=&from=&to=`
Roles: ADMIN (any shift) or RECEPTIONIST (their own shift only). `403 AUDIT_ACCESS_DENIED` otherwise; `404 SHIFT_NOT_FOUND` if missing.
- Returns chronological (ASC) audit entries: `{ shiftId, entries: [{ id, action, entityType, entityId, amount, metadata, actor, createdAt }], pagination }`.
- Actions recorded in production code: `SHIFT_OPENED`, `SHIFT_CLOSED`, `ATTENDANCE_CHECKED_IN`, `EXPENSE_RECORDED`, `SESSION_RECONCILED`, `TEACHER_PAYOUT`.

---

## 11. Health Check (`GET /api/health`)

Public. Verifies database connectivity:
```json
{ "success": true, "data": { "status": "ok", "database": "ok", "system": "Educational Center ERP", "environment": "...", "defaultLocale": "ar", "timestamp": "..." } }
```
DB unreachable → `503 DATABASE_UNAVAILABLE`.

---

## 12. WebSocket Real-Time Specification

### 12.1. Connection & Authentication
- **URL:** same-origin `/socket.io/` (proxy in dev).
- **Auth:** the handshake must supply a JWT either via `socket.handshake.auth.token` or via the signed `access_token` cookie. Only staff roles (`ADMIN`, `RECEPTIONIST`) are admitted; otherwise the connection is rejected (`unauthorized` / `forbidden`).
- Clients call `join:lobby` to receive live lobby broadcasts (`center:lobby` room).

### 12.2. Client-to-Server Events
| Event | Payload | Purpose |
| :--- | :--- | :--- |
| `join:lobby` | – | Join `center:lobby`. Replies `lobby:joined`. |
| `leave:lobby` | – | Leave `center:lobby`. Replies `lobby:left`. |

### 12.3. Server-to-Client Events
| Event | Payload | Purpose |
| :--- | :--- | :--- |
| `lobby:joined` | `{ room, joinedAt }` | Confirms room join. |
| `lobby:left` | `{ room, leftAt }` | Confirms room leave. |
| `lobby:denied` | `{ code, message, messageEn }` | Sent when a non-staff client calls `join:lobby`. |
| `attendance:checked_in` | `{ sessionId, studentId, studentName, deskIdentifier, paymentMethod, newLobbyCount, timestamp }` | Broadcast after every successful check-in to keep all desks in sync. |

> Only the events listed above are implemented. `session:status_changed`, `session:reconciled`, and `shift:closed` broadcasts do **not** currently exist in the codebase.

---

## 13. Error Code Catalog (as implemented)

| Code | HTTP | Typical cause |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | 400 | Fastify schema validation or Prisma validation failure. |
| `INVALID_CREDENTIALS` | 401 | Login failure (also used for inactive accounts). |
| `UNAUTHORIZED` | 401 | Missing/invalid JWT. |
| `FORBIDDEN` | 403 | Role lacks permission, or CSRF origin blocked (`CSRF_ORIGIN_BLOCKED`). |
| `NOT_FOUND` | 404 | Unknown route, missing record (Prisma `P2025`). |
| `DUPLICATE_RECORD` | 409 | Prisma unique violation (`P2002`). |
| `DUPLICATE_CHECK_IN` | 409 | Student already checked in to this session. |
| `FOREIGN_KEY_CONSTRAINT` | 409 | Prisma `P2003`. |
| `RESOURCE_IN_USE` | 409 | Deleting a room/teacher referenced by sessions. |
| `SCHEDULE_CONFLICT` | 409 | Room or teacher already booked in the time window. |
| `SESSION_LOCKED` | 409 | Mutating a completed session (reconcile/settle/delete). |
| `SHIFT_ALREADY_OPEN` | 409 | Opening a second open shift. |
| `SHIFT_CLOSED` | 409 | Race: shift closed mid-operation. |
| `SHIFT_NOT_OPEN` | 400 | Check-in/expense/payout without an open shift. |
| `SESSION_NOT_ACTIVE` | 400 | Check-in to a non-eligible session. |
| `SESSION_CAPACITY_REACHED` | 400 | Room capacity reached. |
| `RECONCILIATION_REQUIRED` | 400 | Settle without reconciliation, or missing resolution notes. |
| `PAYMENT_REFERENCE_REQUIRED` | 400 | Digital payment without a reference. |
| `STUDENT_CODE_CONFLICT` / `STUDENT_IN_USE` | 409 | Student code generation race / student with attendance. |
| `INVALID_REPORT_DATE` | 400 | Bad report date format. |
| `AUDIT_ACCESS_DENIED` | 403 | Receptionist viewing another shift's audit. |
| `RATE_LIMITED` | 429 | Rate limiter exceeded. |
| `DATABASE_UNAVAILABLE` | 503 | Health check when DB is down. |
| `INTERNAL_SERVER_ERROR` / `TRANSACTION_FAILED` / `TRANSACTION_CONFLICT` / `VALUE_TOO_LONG` | 5xx/4xx | Unhandled error / Prisma transaction failures. |