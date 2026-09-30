export const PERMISSIONS = [
  // Administration
  { key: 'users.read', description: 'View users list and user profiles' },
  { key: 'users.manage', description: 'Invite, edit, deactivate users' },
  { key: 'roles.manage', description: 'Create and edit custom RBAC roles' },
  { key: 'settings.manage', description: 'Manage organization settings and rules' },
  { key: 'audit.read', description: 'View system audit logs' },
  { key: 'apikeys.manage', description: 'Generate and revoke API keys' },
  { key: 'webhooks.manage', description: 'Manage webhook subscriptions' },

  // Scope
  { key: 'warehouses.all', description: 'Access data across all warehouses' },

  // Master Data
  { key: 'categories.read', description: 'View product categories' },
  { key: 'categories.write', description: 'Create and modify categories' },
  { key: 'products.read', description: 'View product catalog' },
  { key: 'products.create', description: 'Create new products' },
  { key: 'products.update', description: 'Update existing products' },
  { key: 'products.delete', description: 'Soft delete products' },
  { key: 'suppliers.read', description: 'View supplier directory' },
  { key: 'suppliers.write', description: 'Manage supplier profiles' },
  { key: 'customers.read', description: 'View customer directory' },
  { key: 'customers.write', description: 'Manage customer profiles' },
  { key: 'warehouses.read', description: 'View warehouses' },
  { key: 'warehouses.manage', description: 'Create and edit warehouses/bins' },
  { key: 'imports.run', description: 'Run bulk data import wizard' },

  // Inventory
  { key: 'stock.read', description: 'View current stock levels' },
  { key: 'ledger.read', description: 'View inventory transaction ledger' },
  { key: 'ledger.verify', description: 'Run on-demand ledger integrity checks' },
  { key: 'inventory.opening', description: 'Post opening stock balances' },
  { key: 'inventory.assemble', description: 'Assemble or disassemble product bundles' },
  { key: 'labels.print', description: 'Print barcode/QR labels' },
  { key: 'adjustments.create', description: 'Create draft stock adjustments' },
  { key: 'adjustments.approve', description: 'Approve pending stock adjustments' },
  { key: 'adjustments.post', description: 'Post approved stock adjustments' },
  { key: 'counts.create', description: 'Create stock count plans' },
  { key: 'counts.count', description: 'Perform physical stock counts' },
  { key: 'counts.approve', description: 'Approve count variances' },
  { key: 'transfers.create', description: 'Create stock transfers' },
  { key: 'transfers.dispatch', description: 'Dispatch stock transfers (in-transit)' },
  { key: 'transfers.receive', description: 'Receive stock transfers' },
  { key: 'batches.manage', description: 'Quarantine and manage batches' },
  { key: 'serials.read', description: 'View serial number history' },

  // Purchasing
  { key: 'purchases.read', description: 'View purchase orders and receipts' },
  { key: 'purchases.create', description: 'Create purchase orders' },
  { key: 'purchases.update', description: 'Modify draft purchase orders' },
  { key: 'purchases.approve', description: 'Approve purchase orders' },
  { key: 'purchases.send', description: 'Send purchase orders to suppliers' },
  { key: 'purchases.receive', description: 'Receive goods against purchase orders' },
  { key: 'purchases.cancel', description: 'Cancel purchase orders' },
  { key: 'purchases.close', description: 'Close short purchase orders' },

  // Sales
  { key: 'sales.read', description: 'View sales orders and POS transactions' },
  { key: 'sales.create', description: 'Create sales orders / POS sales' },
  { key: 'sales.update', description: 'Modify draft sales orders' },
  { key: 'sales.confirm', description: 'Confirm sales orders and reserve stock' },
  { key: 'sales.fulfil', description: 'Pick, pack, and ship sales orders' },
  { key: 'sales.cancel', description: 'Cancel sales orders and release stock' },
  { key: 'sales.discount', description: 'Apply line or order discounts' },
  { key: 'sales.below_cost', description: 'Sell items below average cost' },
  { key: 'sales.override_batch', description: 'Manually select batch instead of FEFO' },
  { key: 'invoices.read', description: 'View sales invoices' },
  { key: 'invoices.send', description: 'Send invoices via email/WhatsApp' },
  { key: 'payments.read', description: 'View payment receipts and payables' },
  { key: 'payments.create', description: 'Record payments' },
  { key: 'payments.refund', description: 'Issue payment refunds' },

  // Returns
  { key: 'returns.create', description: 'Create sales or purchase return requests' },
  { key: 'returns.approve', description: 'Approve return requests' },
  { key: 'returns.process', description: 'Process returns and generate credit/debit notes' },

  // Workflow
  { key: 'approvals.read', description: 'View approval inbox' },
  { key: 'approvals.decide', description: 'Approve or reject requests' },

  // Reports
  { key: 'dashboard.read', description: 'View executive dashboard' },
  { key: 'reports.stock', description: 'View stock-on-hand reports' },
  { key: 'reports.valuation', description: 'View inventory valuation reports' },
  { key: 'reports.sales', description: 'View sales summary reports' },
  { key: 'reports.margin', description: 'View gross margin reports' },
  { key: 'reports.purchases', description: 'View purchasing reports' },
  { key: 'reports.finance', description: 'View receivables/payables ageing' },
  { key: 'reports.insights', description: 'View inventory insights (ABC/XYZ, dead stock)' },
  { key: 'gst.read', description: 'View GST registers (sales, purchase, HSN)' },
  { key: 'gst.export', description: 'Export GST data' },

  // Intelligence
  { key: 'forecasts.read', description: 'View demand forecasts' },
  { key: 'suggestions.manage', description: 'Review and generate POs from suggestions' },
  { key: 'anomalies.review', description: 'Review inventory anomalies' },
  { key: 'ai.ask', description: 'Use AI inventory assistant' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
