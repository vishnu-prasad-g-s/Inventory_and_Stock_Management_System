-- 4.2.1 Roles & Privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO stockpilot_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO stockpilot_app;

REVOKE UPDATE, DELETE, TRUNCATE ON "InventoryTransaction" FROM stockpilot_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM stockpilot_app;

-- 4.2.2 Numeric safety nets
ALTER TABLE "Inventory" DROP CONSTRAINT IF EXISTS inv_qty_nonneg;
ALTER TABLE "Inventory" ADD CONSTRAINT inv_qty_nonneg CHECK (quantity >= 0);
ALTER TABLE "Inventory" DROP CONSTRAINT IF EXISTS inv_reserved_range;
ALTER TABLE "Inventory" ADD CONSTRAINT inv_reserved_range
  CHECK ("reservedQuantity" >= 0 AND "reservedQuantity" <= quantity);
ALTER TABLE "Batch" DROP CONSTRAINT IF EXISTS batch_qty_nonneg;
ALTER TABLE "Batch" ADD CONSTRAINT batch_qty_nonneg CHECK (quantity >= 0);
ALTER TABLE "InventoryLocation" DROP CONSTRAINT IF EXISTS invloc_qty_nonneg;
ALTER TABLE "InventoryLocation" ADD CONSTRAINT invloc_qty_nonneg CHECK (quantity >= 0);
ALTER TABLE "CostLayer" DROP CONSTRAINT IF EXISTS layer_qty_nonneg;
ALTER TABLE "CostLayer" ADD CONSTRAINT layer_qty_nonneg CHECK ("qtyRemaining" >= 0);
ALTER TABLE "PurchaseItem" DROP CONSTRAINT IF EXISTS pi_received_range;
ALTER TABLE "PurchaseItem" ADD CONSTRAINT pi_received_range
  CHECK ("receivedQuantity" >= 0 AND "returnedQuantity" >= 0);
ALTER TABLE "SalesItem" DROP CONSTRAINT IF EXISTS si_qty_pos;
ALTER TABLE "SalesItem" ADD CONSTRAINT si_qty_pos
  CHECK (quantity > 0 AND "returnedQuantity" >= 0 AND "returnedQuantity" <= "shippedQuantity");

-- 4.2.3 Ledger sign rules
ALTER TABLE "InventoryTransaction" DROP CONSTRAINT IF EXISTS ledger_sign;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT ledger_sign CHECK (
  ("quantityDelta" > 0 AND type IN
     ('INITIAL_STOCK','PURCHASE','SALES_RETURN','ADJUSTMENT_IN','TRANSFER_IN','ASSEMBLY_IN'))
  OR
  ("quantityDelta" < 0 AND type IN
     ('SALE','PURCHASE_RETURN','DAMAGE','EXPIRY','LOSS','ADJUSTMENT_OUT','TRANSFER_OUT','ASSEMBLY_OUT'))
);
ALTER TABLE "InventoryTransaction" DROP CONSTRAINT IF EXISTS ledger_balance_nonneg;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT ledger_balance_nonneg CHECK ("balanceAfter" >= 0);

-- 4.2.4 Immutable append-only triggers
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_immutable ON "InventoryTransaction";
CREATE TRIGGER ledger_immutable BEFORE UPDATE OR DELETE ON "InventoryTransaction"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DROP TRIGGER IF EXISTS audit_immutable ON "AuditLog";
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- 4.2.5 Ledger chain uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS ledger_chain_prev_uniq
  ON "InventoryTransaction" ("productId","warehouseId","prevHash") WHERE "prevHash" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_chain_genesis_uniq
  ON "InventoryTransaction" ("productId","warehouseId") WHERE "prevHash" IS NULL;

-- 4.2.6 Idempotent ledger writes
CREATE UNIQUE INDEX IF NOT EXISTS ledger_idem_uniq
  ON "InventoryTransaction" ("idempotencyKey","productId","warehouseId","type",
     COALESCE("referenceId",''), COALESCE("batchId",''), COALESCE("serialNumberId",''))
  WHERE "idempotencyKey" IS NOT NULL;

-- 4.2.7 Trigram search indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS product_name_trgm ON "Product" USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS product_sku_trgm  ON "Product" USING gin (sku  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customer_name_trgm ON "Customer" USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS supplier_name_trgm ON "Supplier" USING gin (name gin_trgm_ops);

-- 4.2.8 Low-stock index
CREATE INDEX IF NOT EXISTS inv_low_stock ON "Inventory" ("warehouseId", (quantity - "reservedQuantity"));

-- 4.2.9 Active tax invoice constraint
CREATE UNIQUE INDEX IF NOT EXISTS invoice_one_active
  ON "Invoice" ("salesOrderId", type) WHERE status = 'ISSUED' AND type = 'TAX_INVOICE';
