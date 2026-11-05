import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query:vi.fn(), cleanup:vi.fn() }));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:mocks.query,authRateLimit:{deleteMany:mocks.cleanup},sessionRevocation:{deleteMany:mocks.cleanup},pendingRegistration:{deleteMany:mocks.cleanup}}}));
import { authRateLimitRealm, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
beforeEach(()=>{vi.clearAllMocks();mocks.query.mockResolvedValue([{attempts:1}]);mocks.cleanup.mockResolvedValue({count:0});});
afterEach(()=>vi.unstubAllEnvs());
it('separates trusted deployment realms while keeping every production instance in the same realm',()=>{
  expect(authRateLimitRealm({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_SHA:'a'})).toBe('production');
  expect(authRateLimitRealm({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_SHA:'b'})).toBe('production');
  expect(authRateLimitRealm({VERCEL_ENV:'preview'})).toBe('preview');
  expect(authRateLimitRealm({VERCEL_ENV:'development'})).toBe('development');
  expect(authRateLimitRealm({NETLIFY:'true',CONTEXT:'deploy-preview'})).toBe('preview');
  expect(authRateLimitRealm({NETLIFY:'true',CONTEXT:'branch-deploy'})).toBe('preview');
  expect(authRateLimitRealm({NETLIFY:'true',CONTEXT:'production'})).toBe('production');
  expect(authRateLimitRealm({NETLIFY:'true',CONTEXT:'dev'})).toBe('development');
  expect(authRateLimitRealm({STORE_ISOLATED_TESTS:'1'})).toBe('isolated-tests');
  expect(authRateLimitRealm({NODE_ENV:'development'})).toBe('development');
  expect(authRateLimitRealm({NODE_ENV:'production'})).toBe('production');
});
it('fails closed on unknown or conflicting provider contexts before consuming database quotas',async()=>{
  for(const env of [{VERCEL_ENV:'unknown'},{NETLIFY:'true',CONTEXT:'unknown'},{NETLIFY:'true',CONTEXT:'__proto__'},{VERCEL_ENV:'production',NETLIFY:'true',CONTEXT:'deploy-preview'}]) {
    expect(()=>authRateLimitRealm(env)).toThrow('Konfigurasi');
  }
  vi.stubEnv('VERCEL_ENV','unknown');
  await expect(enforceAuthRateLimit('login','dummy@example.test')).rejects.toMatchObject({status:503});
  expect(mocks.query).not.toHaveBeenCalled();
});
it('namespaces both global and hashed-identity keys without storing the raw identity',async()=>{
  vi.stubEnv('NETLIFY','false');
  for(const realm of ['preview','production']){vi.stubEnv('VERCEL_ENV',realm);await enforceAuthRateLimit('login','Dummy@Example.test');}
  const keys=mocks.query.mock.calls.map(call=>call[1] as string);
  expect(keys).toHaveLength(4);expect(new Set(keys).size).toBe(4);
  expect(keys.filter(key=>key.startsWith('auth:production:login:'))).toHaveLength(2);
  expect(keys.filter(key=>key.startsWith('auth:preview:login:'))).toHaveLength(2);
  expect(keys.filter(key=>key.includes(':global:'))).toHaveLength(2);
  expect(JSON.stringify(keys)).not.toContain('example.test');
});
