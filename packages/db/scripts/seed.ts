import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const password = await argon2.hash('password123');
  const college = await prisma.college.create({ data: { name: 'Tech Institute', domain: 'tech.edu' } });

  await prisma.user.createMany({ data: [
    { email: 'admin@acme.com', passwordHash: password, name: 'Admin', role: 'company_admin' },
    { email: 'int@acme.com', passwordHash: password, name: 'Interviewer', role: 'interviewer' },
    { email: 'off@tech.edu', passwordHash: password, name: 'Officer', role: 'college_officer' },
  ]});

  await prisma.student.createMany({ data: [
    { name: 'Eligible', collegeId: college.id, batchYear: 2028, branch: 'CSE', cgpa: 9.0, collegeEmail: 'el@tech.edu', status: 'verified' },
    { name: 'Ineligible', collegeId: college.id, batchYear: 2028, branch: 'CSE', cgpa: 6.0, collegeEmail: 'in@tech.edu', status: 'verified' },
  ]});
}
main();