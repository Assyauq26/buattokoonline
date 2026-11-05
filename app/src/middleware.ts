import { NextResponse, type NextRequest } from 'next/server';

/** A closed release profile blocks business requests before auth/Prisma runs. */
export function middleware(request: NextRequest) {
  const mode = process.env.MAINTENANCE_MODE;
  if (!mode || mode === '0') return NextResponse.next();
  // Unknown values also close traffic: a typo must not accidentally open release.
  const pathname = request.nextUrl.pathname;
  if (['GET', 'HEAD'].includes(request.method) && (pathname === '/api/v1/health' || pathname === '/favicon.ico' || pathname.startsWith('/_next/static/') || pathname === '/_next/image')) return NextResponse.next();
  const headers = { 'Cache-Control': 'no-store, max-age=0', 'Retry-After': '60' };
  const message = 'Layanan sedang dalam pemeliharaan. Silakan coba kembali nanti.';
  if (request.nextUrl.pathname.startsWith('/api/') || request.method !== 'GET') {
    return NextResponse.json({ success: false, error: { message } }, { status: 503, headers });
  }
  return new NextResponse(`<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pemeliharaan</title><main><h1>Pemeliharaan sementara</h1><p>${message}</p></main></html>`, {
    status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// Match every method; even a forged Action POST to an asset path stays closed.
export const config = { matcher: ['/:path*'] };
