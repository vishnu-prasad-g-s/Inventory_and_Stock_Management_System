# StockPilot Architecture Decision Records (ADR Log)

## Record Format
Every decision recorded here must include ID, Date, Context, Decision, Consequences, and Rationale.

---

### ADR-01: Programming Language
- **Choice**: TypeScript (Strict Mode)
- **Rationale**: Single unified language across UI, API route handlers, worker background jobs, and test suites. Strict type-safety eliminates an entire class of runtime errors.

### ADR-02: Web Framework
- **Choice**: Next.js (App Router) + React
- **Rationale**: Full-stack framework offering React Server Components, server side route handlers, and streamlined page routing.

### ADR-03: Database Engine
- **Choice**: PostgreSQL 16
- **Rationale**: Supports ACID transactions, row-level locks (`FOR UPDATE`), database CHECK constraints, JSONB column types, and transactional table alterations.

### ADR-04: Data Access & ORM Strategy
- **Choice**: Prisma for CRUD operations and schema migrations; **Raw SQL** (`$queryRaw` / `$executeRaw`) for core stock movement logic.
- **Rationale**: Prisma cannot express atomic guarded UPDATEs with dynamic balance and weighted-average-cost expressions (`UPDATE "Inventory" SET quantity = quantity - $1 WHERE productId = $2 AND warehouseId = $3 AND (quantity - $1) >= reservedQuantity`).

### ADR-05: Authentication Strategy
- **Choice**: Auth.js (NextAuth v5) with Database Sessions, Credentials Provider, and Argon2id Hashing.
- **Rationale**: Database sessions allow immediate revocation on password change or admin intervention. Argon2id satisfies OWASP standards.

### ADR-06: Schema & Input Validation
- **Choice**: Zod schemas shared between client and server.
- **Rationale**: Guarantees a single source of truth for runtime validation of request bodies, query params, and environment variables.

### ADR-07: UI Components & Styling
- **Choice**: Tailwind CSS + shadcn/ui + TanStack Table + React Hook Form + TanStack Query.
- **Rationale**: Accessible, headless, modern aesthetic with no vendor lock-in.

### ADR-08: Data Visualization
- **Choice**: Recharts.
- **Rationale**: Lightweight React charting library suitable for inventory trends and dashboard metrics.

### ADR-09: Background Processing
- **Choice**: pg-boss worker process backed by Postgres.
- **Rationale**: Transactional job enqueueing without adding Redis dependency.

### ADR-10: Object Storage
- **Choice**: S3-compatible storage (MinIO locally, S3/R2 in production).
- **Rationale**: Secure handling of invoice PDFs, import attachments, and document uploads.

### ADR-15: Costing Method
- **Choice**: Weighted Average Cost (WAC) default; FIFO optional; locked upon initial organization setup.
- **Rationale**: Prevents inventory valuation distortion and tax discrepancies.

### ADR-16: Ledger Sign Convention
- **Choice**: DB stores signed `quantityDelta`; API endpoints accept positive magnitudes and derive sign from `InvTxType`.
- **Rationale**: Eliminates sign confusion across endpoints.

### ADR-17: Ledger Hash Chain Scope
- **Choice**: Per `(productId, warehouseId)` pair.
- **Rationale**: A global ledger hash chain would serialize every stock movement across the entire enterprise, creating a bottleneck.

### ADR-18: Concurrency & Oversell Protection
- **Choice**: Atomic guarded `UPDATE "Inventory" ... WHERE quantity - delta >= reservedQuantity` + row-level locking + deadlock retry runner.
- **Rationale**: Guarantees zero overselling under high concurrency without read-then-write race conditions.

### ADR-19: Idempotency Key Enforcement
- **Choice**: Insert `IdempotencyKey` row inside the business transaction.
- **Rationale**: Concurrent duplicate requests block on the unique database index `(key, userId)`.

### ADR-21: Numeric & Financial Precision
- **Choice**: Money `Decimal(14,2)`, quantities `Decimal(14,3)`, unit costs `Decimal(14,4)`. Never use JS `number` for monetary calculations.
- **Rationale**: Eliminates floating-point rounding errors.

### ADR-22: Timezone Handling
- **Choice**: Store timestamps in UTC (`timestamptz`); display in `Asia/Kolkata` (IST); Indian Financial Year (Apr–Mar).
- **Rationale**: Consistency across tax registers and reports.
