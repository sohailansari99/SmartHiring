import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  // Clear existing
  await prisma.auditLog.deleteMany();
  await prisma.student.deleteMany();
  await prisma.collegeOfficer.deleteMany();
  await prisma.college.deleteMany();
  await prisma.companyMember.deleteMany();
  await prisma.testAudience.deleteMany();
  await prisma.test.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();

  const password = await argon2.hash('password123');

  // 1. Company
  const company = await prisma.company.create({
    data: {
      name: 'Acme Corp',
      domain: 'acme.com',
      industry: 'Software',
      contactEmail: 'admin@acme.com',
      verified: true,
      verificationStatus: 'verified',
    },
  });

  // 2. College
  const college = await prisma.college.create({
    data: {
      name: 'Tech Institute',
      domain: 'tech.edu',
    },
  });

  // 3. Users: Admin, Interviewer, Officer, Eligible Student, Ineligible Student
  const adminUser = await prisma.user.create({
    data: { email: 'admin@acme.com', passwordHash: password, name: 'Acme Admin', role: 'company_admin' },
  });

  const interviewerUser = await prisma.user.create({
    data: { email: 'interviewer@acme.com', passwordHash: password, name: 'Acme Interviewer', role: 'interviewer' },
  });

  const officerUser = await prisma.user.create({
    data: { email: 'officer@tech.edu', passwordHash: password, name: 'Tech Officer', role: 'college_officer' },
  });

  const eligibleUser = await prisma.user.create({
    data: { email: 'eligible@tech.edu', passwordHash: password, name: 'Eligible Student', role: 'student' },
  });

  const ineligibleUser = await prisma.user.create({
    data: { email: 'ineligible@tech.edu', passwordHash: password, name: 'Ineligible Student', role: 'student' },
  });

  // 4. Relationships
  await prisma.companyMember.createMany({
    data: [
      { companyId: company.id, userId: adminUser.id, role: 'company_admin' },
      { companyId: company.id, userId: interviewerUser.id, role: 'interviewer' },
    ],
  });

  await prisma.collegeOfficer.create({
    data: { collegeId: college.id, userId: officerUser.id },
  });

  // 5. Students
  await prisma.student.create({
    data: {
      userId: eligibleUser.id,
      name: 'Eligible Student',
      collegeId: college.id,
      batchYear: 2028,
      branch: 'CSE',
      cgpa: 8.5,
      rollNo: 'CS001',
      collegeEmail: 'eligible@tech.edu',
      status: 'verified',
    },
  });

  await prisma.student.create({
    data: {
      userId: ineligibleUser.id,
      name: 'Ineligible Student',
      collegeId: college.id,
      batchYear: 2028,
      branch: 'CSE',
      cgpa: 5.5, // Below typical 7.0 cutoff
      rollNo: 'CS002',
      collegeEmail: 'ineligible@tech.edu',
      status: 'verified',
    },
  });

  // Print emails and roles only
  const users = await prisma.user.findMany({ select: { email: true, role: true } });
  for (const u of users) {
    console.log(`${u.email}: ${u.role}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
