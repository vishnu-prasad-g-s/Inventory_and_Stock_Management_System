import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '../server/lib/permissions';
import { hashPassword } from '../server/services/users/password';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting StockPilot database seeding...');

  // 1. Seed Permissions
  console.log('Seeding permission catalogue...');
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description },
      create: { key: p.key, description: p.description },
    });
  }

  // Helper to map keys to Permission IDs
  const allPermissions = await prisma.permission.findMany();
  const permMap = new Map(allPermissions.map((p) => [p.key, p.id]));

  // 2. Define System Roles & Role Assignments (Section 9 Matrix)
  const roleDefs = [
    {
      name: 'Admin',
      description: 'System Administrator with full access',
      isSystem: true,
      permKeys: Array.from(permMap.keys()),
    },
    {
      name: 'Manager',
      description: 'Warehouse & Sales Manager',
      isSystem: true,
      permKeys: Array.from(permMap.keys()).filter((k) => !['users.manage', 'roles.manage', 'inventory.opening'].includes(k)),
    },
    {
      name: 'Warehouse Staff',
      description: 'Warehouse floor operational staff',
      isSystem: true,
      permKeys: [
        'products.read', 'products.update', 'warehouses.read', 'stock.read', 'ledger.read',
        'adjustments.create', 'counts.count', 'transfers.create', 'transfers.dispatch',
        'transfers.receive', 'batches.manage', 'labels.print', 'purchases.read',
        'purchases.receive', 'sales.fulfil', 'returns.create', 'returns.process',
        'dashboard.read', 'reports.stock', 'ai.ask'
      ],
    },
    {
      name: 'Sales Staff',
      description: 'POS cashier and sales representative',
      isSystem: true,
      permKeys: [
        'products.read', 'customers.read', 'customers.write', 'warehouses.read',
        'stock.read', 'labels.print', 'sales.read', 'sales.create', 'sales.update',
        'sales.confirm', 'sales.fulfil', 'sales.discount', 'invoices.read', 'invoices.send',
        'payments.read', 'payments.create', 'returns.create', 'dashboard.read', 'ai.ask'
      ],
    },
    {
      name: 'Accountant',
      description: 'Finance and compliance auditor',
      isSystem: true,
      permKeys: [
        'warehouses.all', 'audit.read', 'products.read', 'suppliers.read', 'customers.read',
        'warehouses.read', 'stock.read', 'ledger.read', 'purchases.read', 'sales.read',
        'invoices.read', 'invoices.send', 'payments.read', 'payments.create', 'payments.refund',
        'approvals.read', 'dashboard.read', 'reports.stock', 'reports.valuation',
        'reports.sales', 'reports.margin', 'reports.purchases', 'reports.finance',
        'reports.insights', 'gst.read', 'gst.export', 'ai.ask'
      ],
    },
    {
      name: 'Viewer',
      description: 'Read-only access to catalogs and reports',
      isSystem: true,
      permKeys: [
        'products.read', 'suppliers.read', 'customers.read', 'warehouses.read',
        'stock.read', 'ledger.read', 'purchases.read', 'sales.read', 'invoices.read',
        'dashboard.read', 'reports.stock', 'reports.sales', 'reports.purchases', 'ai.ask'
      ],
    },
  ];

  const roleMap = new Map<string, string>();

  for (const rd of roleDefs) {
    const role = await prisma.role.upsert({
      where: { name: rd.name },
      update: { description: rd.description, isSystem: rd.isSystem },
      create: { name: rd.name, description: rd.description, isSystem: rd.isSystem },
    });

    roleMap.set(rd.name, role.id);

    // Sync role permissions
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const rolePermData = rd.permKeys
      .map((k) => permMap.get(k))
      .filter((id): id is string => !!id)
      .map((permissionId) => ({ roleId: role.id, permissionId }));

    await prisma.rolePermission.createMany({ data: rolePermData });
  }

  // 3. Seed Default Organization
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.log('Seeding default organization...');
    await prisma.organization.create({
      data: {
        name: 'StockPilot Demo Company',
        legalName: 'StockPilot Systems India Pvt Ltd',
        gstin: '27AAAAA0000A1Z5',
        stateCode: '27', // Maharashtra
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        costingMethod: 'WAC',
        costingLocked: true,
        fyStartMonth: 4,
      },
    });
  }

  // 4. Seed Default Warehouse
  console.log('Seeding default warehouse...');
  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'WH-MAIN' },
    update: { name: 'Main Warehouse' },
    create: {
      code: 'WH-MAIN',
      name: 'Main Warehouse',
      address: 'Industrial Zone, Mumbai',
      stateCode: '27',
    },
  });

  // 5. Seed Admin User
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@stockpilot.local').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'AdminPassword123!';
  const adminRoleId = roleMap.get('Admin')!;

  console.log(`Seeding Admin user (${adminEmail})...`);
  const passwordHash = await hashPassword(adminPassword);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      roleId: adminRoleId,
      status: 'ACTIVE',
    },
    create: {
      name: 'Super Admin',
      email: adminEmail,
      passwordHash,
      roleId: adminRoleId,
      status: 'ACTIVE',
      mustChangePassword: true,
      warehouses: {
        create: [{ warehouseId: warehouse.id }],
      },
    },
  });

  // 6. Seed Default Category
  await prisma.category.upsert({
    where: { parentId_name: { parentId: null as any, name: 'General' } },
    update: {},
    create: { name: 'General', description: 'Default category' },
  });

  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
