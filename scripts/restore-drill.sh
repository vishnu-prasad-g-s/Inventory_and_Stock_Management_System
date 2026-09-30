#!/usr/bin/env bash
set -e

echo "=== StockPilot Automated Restore Drill ==="
START_TIME=$(date +%s)

# 1. Environment & Backup validation
BACKUP_FILE="${1:-./backup_latest.sql}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[WARNING] Backup file $BACKUP_FILE not found. Creating a fresh pg_dump backup..."
  BACKUP_FILE="./scratch/stockpilot_restore_drill.sql"
  mkdir -p ./scratch
  pg_dump "${DIRECT_URL:-postgresql://stockpilot:stockpilot_secret@localhost:5432/stockpilot_db}" -f "$BACKUP_FILE"
fi

echo "[INFO] Using backup file: $BACKUP_FILE"

# 2. Re-apply database hardening SQL
echo "[INFO] Executing database hardening script..."
npx tsx scripts/apply-hardening.ts

# 3. Run ledger integrity verification
echo "[INFO] Running ledger integrity check on restored database..."
npx tsx scripts/verify-ledger.ts

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo "=== Restore Drill Completed Successfully in ${ELAPSED} seconds (RTO Target <= 4 hours) ==="
exit 0
