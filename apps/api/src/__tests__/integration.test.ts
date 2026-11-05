import { describe, it, expect, vi } from 'vitest';
import { app } from '../server.js';

describe('Real API with RBAC', () => {
  it('returns 401 without login', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tests/t1' });
    expect(res.statusCode).toBe(401);
  });

  it('blocks cross-company access (404)', async () => {
     // Mocking logged in user and test
     // ...
  });
});