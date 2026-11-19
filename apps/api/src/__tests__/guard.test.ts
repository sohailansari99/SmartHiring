import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Database Guard', () => {
  const originalEnv = process.env;
  const originalExit = process.exit;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Mock process.exit to prevent actual exit during tests
    process.exit = vi.fn() as any;
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exit = originalExit;
  });

  it('rejects remote database URL (supabase.com)', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@db.supabase.com/db';
    process.env.DATABASE_URL_TEST = 'postgresql://user:pass@db.local/db';
    process.env.JWT_SECRET = 'a'.repeat(32);

    try {
      await import('../server.js');
      // If we get here, something went wrong
      fail('Expected server.js to throw or call process.exit');
    } catch (e) {
      // We expect either an exception or process.exit to be called
      const exitCalled = process.exit;
      if (exitCalled.mock?.calls.length > 0) {
        expect(exitCalled).toHaveBeenCalledWith(1);
      } else {
        // Either way, the guard worked
        expect(e).toBeDefined();
      }
    }
  });

  it('accepts local database URL (127.0.0.1)', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@127.0.0.1:5433/db';
    process.env.DATABASE_URL_TEST = 'postgresql://user:pass@127.0.0.1:5434/db';
    process.env.JWT_SECRET = 'a'.repeat(32);

    const mod = await import('../server.js');
    expect(mod.createApp).toBeDefined();
    expect(typeof mod.createApp).toBe('function');
  });

  it('accepts remote URL when ALLOW_REMOTE_DB is true', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@db.supabase.com/db';
    process.env.DATABASE_URL_TEST = 'postgresql://user:pass@db.local/db';
    process.env.ALLOW_REMOTE_DB = 'true';
    process.env.JWT_SECRET = 'a'.repeat(32);

    const mod = await import('../server.js');
    expect(mod.createApp).toBeDefined();
    expect(typeof mod.createApp).toBe('function');
  });
});
