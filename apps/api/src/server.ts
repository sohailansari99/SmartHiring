// API logic with real Auth/RBAC and Postgres via Prisma

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { authMiddleware, roleGuard } from './auth.js';
import { checkEligibility } from '@signal/shared';

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

app.register(cors, { origin: true, credentials: true });
app.register(cookie);
app.register(jwt, { secret: process.env.JWT_SECRET || 'dev-secret' });

// 1. Auth: Register Company
app.post('/api/auth/register-company', async (req, reply) => {
  const { name, domain, contactEmail, password } = req.body as any;
  const hash = await argon2.hash(password);

  const company = await prisma.company.create({
    data: { name, domain, contactEmail, members: { create: { role: 'company_admin', user: { create: { email: contactEmail, passwordHash: hash, name: 'Admin', role: 'company_admin' } } } } }
  });

  // Verification logic: Print link to console
  const token = Math.random().toString(36).substring(7);
  console.log(`[Verification] Visit: http://localhost:3001/api/verify?token=${token}`);

  return reply.send({ company });
});

// 2. Student approval (RBAC)
app.post('/api/students/:id/approve', {
  preHandler: [authMiddleware, roleGuard(['college_officer'])]
}, async (req, reply) => {
  const student = await prisma.student.findUnique({ where: { id: req.params.id as string }, include: { college: true } });
  const user = req.user as any;

  // Must be officer of the SAME college
  const officer = await prisma.collegeOfficer.findUnique({ where: { userId: user.id } });
  if (student?.collegeId !== officer?.collegeId) return reply.status(403).send();

  await prisma.student.update({ where: { id: student.id }, data: { status: 'verified' } });

  // Audit log
  await prisma.auditLog.create({ data: { action: 'student.verified', summary: `Approved student ${student.name}`, actorId: user.id } });

  return reply.send({ success: true });
});

// 3. Test Detail (Eligibility check + RBAC)
app.get('/api/tests/:testId', { preHandler: [authMiddleware] }, async (req, reply) => {
  const user = req.user as any;
  const student = await prisma.student.findUnique({ where: { userId: user.id } });
  const test = await prisma.test.findUnique({ where: { id: req.params.testId as string }, include: { audience: true } });

  if (!student || !test || !checkEligibility(student, test as any).allowed) {
    return reply.status(404).send();
  }
  return reply.send(test);
});

// ... rest of API ...

export { app };