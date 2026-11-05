import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
afterEach(() => vi.unstubAllEnvs());
it('preserves normal routing when maintenance is unset or explicitly inactive', () => {
  for (const mode of ['', '0']) {
    vi.stubEnv('MAINTENANCE_MODE', mode);
    expect(middleware(new NextRequest('http://localhost/shop')).headers.get('x-middleware-next')).toBe('1');
  }
});
it('closes pages, API, Server Actions and cron for enabled or invalid mode', () => {
  for (const mode of ['1', 'invalid']) {
    vi.stubEnv('MAINTENANCE_MODE', mode);
    for (const [route, method] of [['/shop','GET'],['/api/v1/orders','POST'],['/cart','POST'],['/api/internal/cron/expire-orders','GET'],['/_next/static/synthetic.js','POST']]) {
      const response=middleware(new NextRequest('http://localhost'+route,{method,headers:{'Next-Action':'synthetic'}}));
      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toContain('no-store');
    }
  }
});
it('keeps only read-only liveness accessible during a closed release', () => {
  vi.stubEnv('MAINTENANCE_MODE','1');
  expect(middleware(new NextRequest('http://localhost/api/v1/health')).headers.get('x-middleware-next')).toBe('1');
  expect(middleware(new NextRequest('http://localhost/api/v1/health',{method:'POST'})).status).toBe(503);
  expect(middleware(new NextRequest('http://localhost/_next/static/synthetic.js')).headers.get('x-middleware-next')).toBe('1');
  expect(middleware(new NextRequest('http://localhost/_next/static/synthetic.js',{method:'POST'})).status).toBe(503);
});
