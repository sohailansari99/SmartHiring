// Seed script for Signal database - creates initial test data
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const pw = await argon2.hash('password123');

  // Create colleges
  const college1 = await prisma.college.create({
    data: { name: 'Tech Institute', domain: 'tech-p1.edu' },
  });
  const college2 = await prisma.college.create({
    data: { name: 'State University', domain: 'state-p1.edu' },
  });

  // Create companies
  const comp1 = await prisma.company.create({
    data: {
      name: 'Acme Corp',
      domain: 'acme-p1.com',
      industry: 'Software',
      contactEmail: 'admin@acme-p1.com',
      verified: true,
      verificationStatus: 'verified',
      members: {
        create: {
          role: 'company_admin',
          user: {
            create: {
              email: 'admin@acme-p1.com',
              passwordHash: pw,
              name: 'Acme Admin',
              role: 'company_admin',
            },
          },
        },
      },
    },
  });

  const comp2 = await prisma.company.create({
    data: {
      name: 'Globex',
      domain: 'globex-p1.com',
      industry: 'Finance',
      contactEmail: 'boss@globex-p1.com',
      verified: true,
      verificationStatus: 'verified',
      members: {
        create: {
          role: 'company_admin',
          user: {
            create: {
              email: 'boss@globex-p1.com',
              passwordHash: pw,
              name: 'Globex Boss',
              role: 'company_admin',
            },
          },
        },
      },
    },
  });

  // Create officers
  const officer1 = await prisma.user.create({
    data: {
      email: 'off1@tech-p1.edu',
      passwordHash: pw,
      name: 'Officer One',
      role: 'college_officer',
    },
  });
  const officer2 = await prisma.user.create({
    data: {
      email: 'off2@state-p1.edu',
      passwordHash: pw,
      name: 'Officer Two',
      role: 'college_officer',
    },
  });

  await prisma.collegeOfficer.create({
    data: { collegeId: college1.id, userId: officer1.id },
  });
  await prisma.collegeOfficer.create({
    data: { collegeId: college2.id, userId: officer2.id },
  });

  // Create students
  const student1 = await prisma.user.create({
    data: {
      email: 's1@tech-p1.edu',
      passwordHash: pw,
      name: 'Student One',
      role: 'student',
    },
  });
  const student2 = await prisma.user.create({
    data: {
      email: 's2@state-p1.edu',
      passwordHash: pw,
      name: 'Student Two',
      role: 'student',
    },
  });

  await prisma.student.create({
    data: {
      userId: student1.id,
      collegeId: college1.id,
      name: 'Student One',
      batchYear: 2028,
      branch: 'CSE',
      cgpa: 8.5,
      rollNo: '001',
      collegeEmail: 's1@tech-p1.edu',
      status: 'pending', // Ineligible - pending status
      registeredVia: 'self',
    },
  });

  await prisma.student.create({
    data: {
      userId: student2.id,
      collegeId: college2.id,
      name: 'Student Two',
      batchYear: 2027,
      branch: 'IT',
      cgpa: 9.0,
      rollNo: '002',
      collegeEmail: 's2@state-p1.edu',
      status: 'verified', // Eligible - verified
      registeredVia: 'self',
    },
  });

  // Create a question and test for Globex
  const question = await prisma.question.create({
    data: {
      companyId: comp2.id,
      title: 'Two Sum',
      difficulty: 'easy',
      topics: ['arrays'],
      timeLimitSeconds: 60,
      memoryLimitMb: 256,
      description: 'Find two indices that sum to target',
      inputFormat: 'array',
      outputFormat: 'indices',
      constraints: '',
      mode: 'stdio',
      allowedLanguages: ['javascript'],
      starterCode: {},
      referenceSolution: '',
      customChecker: '',
    },
  });

  await prisma.test.create({
    data: {
      companyId: comp2.id,
      name: 'Open Mock Test',
      type: 'mock',
      durationMinutes: 30,
      passMark: 50,
      openAt: new Date('2026-01-01'),
      closeAt: new Date('2027-01-01'),
      status: 'published',
      roundNumber: 1,
      requiresCamera: false,
      requiresMicrophone: false,
      cpuLimitMs: 5000,
      ramLimitMb: 256,
      aiMonitoring: {},
      allowedLanguages: [],
      audience: {
        create: {
          collegeIds: [],
          batches: [],
          branches: [],
          minCgpa: 0,
        },
      },
      questions: {
        create: [{ questionId: question.id, order: 0 }],
      },
    },
  });

  console.log('Seed completed successfully!');
  console.log('\nTest accounts:');
  console.log('  Admin (Acme): admin@acme-p1.com / password123');
  console.log('  Admin (Globex): boss@globex-p1.com / password123');
  console.log('  Officer (Tech): off1@tech-p1.edu / password123');
  console.log('  Officer (State): off2@state-p1.edu / password123');
  console.log('  Student (Tech, pending): s1@tech-p1.edu / password123');
  console.log('  Student (State, verified): s2@state-p1.edu / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
