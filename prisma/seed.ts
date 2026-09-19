/**
 * Prisma Demo Seed Script — Educational Center ERP (SaaS)
 * ============================================================
 * Creates a fully-populated, demo-ready dataset: a working center
 * (سنتر الأوائل التعليمي) plus platform tenants for the Super Admin.
 *
 * DEMO CREDENTIALS
 * ─────────────────────────────────────────────
 *   Admin       username: admin        password: Admin@12345!
 *   Reception   username: reception1   password: Desk@12345!
 *   Super Admin username: superadmin   password: Platform@12345!
 *
 * Run with:  npm run db:seed
 * ============================================================
 */

import { PrismaClient } from '@prisma/client';
import { seedDemoData } from '../src/server/lib/demoSeed.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Starting demo seed…\n');
  await seedDemoData(prisma);
  console.log('🎉 Demo seed completed successfully!\n');
  console.log('  Admin       : admin      / Admin@12345!');
  console.log('  Receptionist: reception1 / Desk@12345!');
  console.log('  Super Admin : superadmin / Platform@12345!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
