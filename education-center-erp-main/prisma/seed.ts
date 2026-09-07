/**
 * Prisma Database Seed Script
 * ============================================================
 * Project: Educational Center ERP (Arabic-First, RTL)
 * Purpose: Bootstrap the database with an Admin user account
 *          and representative reference data for development
 *          and initial deployment.
 *
 * Seeded Data:
 *   1. Admin user account  (role: ADMIN)
 *   2. Sample receptionist (role: RECEPTIONIST)
 *   3. Sample rooms        (3 lecture halls)
 *   4. Sample teachers     (2 teachers with Arabic names)
 *   5. Sample students     (5 students with Egyptian phone numbers)
 *
 * Run with:
 *   npx prisma db seed
 *   OR
 *   npm run db:seed
 *
 * SECURITY NOTE:
 *   Default passwords are for development/demo only.
 *   Change them immediately before any production deployment.
 * ============================================================
 */

import { PrismaClient } from '@prisma/client';
import { Role, SchoolType } from '../src/shared/constants/index.js';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ─── Arabic Normalization (mirrors src/shared/utils/arabicNormalization.ts) ──
// Used here to pre-compute the `search_name` column value on insert.
function normalizeArabicText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '') // Remove Harakat/Tashkeel
    .replace(/[\u0640]/g, '')               // Remove Tatweel (Kashida)
    .replace(/[أإآا]/g, 'ا')               // Normalize Alef variants
    .replace(/ة/g, 'ه')                    // Normalize Taa Marbouta
    .replace(/ى/g, 'ي')                    // Normalize Alef Maksoura
    .replace(/\s+/g, ' ')                  // Collapse whitespace
    .trim()
    .toLowerCase();
}

// ─── Student Code Generator ───────────────────────────────────────────────────
function generateStudentCode(index: number): string {
  return `STU-${String(index).padStart(5, '0')}`;
}

async function main(): Promise<void> {
  console.log('🌱  Starting database seed...\n');

  const isProduction = process.env.NODE_ENV === 'production';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (!isProduction ? 'Admin@12345!' : undefined);
  const receptionistPassword = process.env.SEED_RECEPTIONIST_PASSWORD || (!isProduction ? 'Desk@12345!' : undefined);
  if (!adminPassword || !receptionistPassword) {
    throw new Error('SEED_ADMIN_PASSWORD and SEED_RECEPTIONIST_PASSWORD are required in production.');
  }

  // ──────────────────────────────────────────────────────────────
  // 1. ADMIN USER
  // ──────────────────────────────────────────────────────────────
  const adminPasswordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,   // 64 MiB
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username:          'admin',
      email:             'admin@educentererp.local',
      passwordHash:      adminPasswordHash,
      fullName:          'مدير النظام',
      role:              Role.ADMIN,
      phoneNumber:       '01000000000',
      preferredLanguage: 'ar',
      isActive:          true,
    },
  });
  console.log(`✅  Admin user created:       ${admin.fullName} (@${admin.username})`);

  // ──────────────────────────────────────────────────────────────
  // 2. RECEPTIONIST USER
  // ──────────────────────────────────────────────────────────────
  const receptionistPasswordHash = await argon2.hash(receptionistPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const receptionist = await prisma.user.upsert({
    where: { username: 'reception1' },
    update: {},
    create: {
      username:          'reception1',
      email:             'reception1@educentererp.local',
      passwordHash:      receptionistPasswordHash,
      fullName:          'سارة عبد الرحمن',
      role:              Role.RECEPTIONIST,
      phoneNumber:       '01012345678',
      preferredLanguage: 'ar',
      isActive:          true,
    },
  });
  console.log(`✅  Receptionist created:     ${receptionist.fullName} (@${receptionist.username})`);

  // ──────────────────────────────────────────────────────────────
  // 3. ROOMS  (Lecture Halls)
  // ──────────────────────────────────────────────────────────────
  const roomsData = [
    { name: 'قاعة ١ (الكبرى)',  capacity: 120, floor: 'الطابق الأول' },
    { name: 'قاعة ٢ (المتوسطة)', capacity: 60,  floor: 'الطابق الأول' },
    { name: 'قاعة ٣ (الصغيرة)', capacity: 30,  floor: 'الطابق الثاني' },
  ];

  const rooms = await Promise.all(
    roomsData.map((room) =>
      prisma.room.upsert({
        where:  { name: room.name },
        update: {},
        create: { ...room, isActive: true },
      })
    )
  );
  rooms.forEach((r) => console.log(`✅  Room created:             ${r.name} (سعة: ${r.capacity} مقعد)`));

  // ──────────────────────────────────────────────────────────────
  // 4. TEACHERS
  // ──────────────────────────────────────────────────────────────
  const teachersData = [
    {
      fullName:         'أ/ محمد عبد الفتاح',
      phoneNumber:      '01011111111',
      subject:          'فيزياء',
      defaultCenterFee: 20.00,
      assistantName:    'م/ وليد سامي',
      assistantPhone:   '01022222222',
    },
    {
      fullName:         'أ/ نادية إبراهيم',
      phoneNumber:      '01033333333',
      subject:          'رياضيات',
      defaultCenterFee: 15.00,
      assistantName:    null,
      assistantPhone:   null,
    },
  ];

  const teachers = await Promise.all(
    teachersData.map((t) =>
      prisma.teacher.create({
        data: {
          fullName:         t.fullName,
          searchName:       normalizeArabicText(t.fullName),
          phoneNumber:      t.phoneNumber,
          subject:          t.subject,
          defaultCenterFee: t.defaultCenterFee,
          assistantName:    t.assistantName,
          assistantPhone:   t.assistantPhone,
          isActive:         true,
        },
      })
    )
  );
  teachers.forEach((t) => console.log(`✅  Teacher created:          ${t.fullName} (${t.subject})`));

  // ──────────────────────────────────────────────────────────────
  // 5. STUDENTS  (Representative Egyptian sample data)
  // ──────────────────────────────────────────────────────────────
  const studentsData = [
    {
      fullName:      'أحمد محمود حسن',
      studentPhone:  '01099991111',
      guardianPhone: '01099992222',
      academicStage: 'الثالث الثانوي',
      schoolType:    SchoolType.GENERAL,
    },
    {
      fullName:      'فاطمة علي إبراهيم',
      studentPhone:  '01099993333',
      guardianPhone: '01099994444',
      academicStage: 'الثاني الثانوي',
      schoolType:    SchoolType.LANGUAGES,
    },
    {
      fullName:      'محمد عمر عبد الله',
      studentPhone:  null,
      guardianPhone: '01099995555',
      academicStage: 'الثالث الثانوي',
      schoolType:    SchoolType.GENERAL,
    },
    {
      fullName:      'إسلام أحمد رضا',
      studentPhone:  '01099996666',
      guardianPhone: '01099997777',
      academicStage: 'الأول الثانوي',
      schoolType:    SchoolType.AZHAR,
    },
    {
      fullName:      'نور الهدى مصطفى',
      studentPhone:  '01099998888',
      guardianPhone: '01099999999',
      academicStage: 'الثالث الإعدادي',
      schoolType:    SchoolType.GENERAL,
    },
  ];

  const students = await Promise.all(
    studentsData.map((s, i) =>
      prisma.student.create({
        data: {
          studentCode:   generateStudentCode(i + 1),
          fullName:      s.fullName,
          searchName:    normalizeArabicText(s.fullName),
          studentPhone:  s.studentPhone,
          guardianPhone: s.guardianPhone,
          academicStage: s.academicStage,
          schoolType:    s.schoolType,
        },
      })
    )
  );
  students.forEach((s) => console.log(`✅  Student created:          ${s.fullName} (${s.studentCode})`));

  // ──────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────────');
  console.log('🎉  Seed completed successfully!');
  console.log('');
  console.log('   Seed users created. Credentials are supplied through environment variables.');
  console.log('─────────────────────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
