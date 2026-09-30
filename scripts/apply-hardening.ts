import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Applying database hardening SQL...');
  const sqlPath = join(__dirname, '../prisma/sql/hardening.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  // Split and execute SQL statements
  await prisma.$executeRawUnsafe(sql);
  console.log('Database hardening SQL applied successfully.');
}

main()
  .catch((err) => {
    console.error('Error applying hardening SQL:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
