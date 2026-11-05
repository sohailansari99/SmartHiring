// 1. Prisma schema remains (apps/api/prisma/schema.prisma)
// 2. Auth middleware
import { FastifyReply, FastifyRequest } from 'fastify';

export async function authMiddleware(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

export function roleGuard(roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    if (!roles.includes(user.role)) {
      reply.status(403).send({ error: 'Forbidden' });
    }
  };
}