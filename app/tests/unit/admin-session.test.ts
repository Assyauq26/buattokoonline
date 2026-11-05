import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), user: { findUnique: vi.fn() }, cart: { findUnique: vi.fn() } }));
vi.mock('server-only', () => ({}));
// React.cache is provided by Next's RSC runtime, not React 18's Node test export.
// Identity behavior is tested here; actual request isolation is covered by HTTP/RBAC tests.
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'signed-session-fixture' }) }) }));
vi.mock('@/lib/auth/jwt', () => ({ verifySessionClaims: async () => ({ sub: 'staff', version: 0, tokenHash: 'fixture-digest', expiresAt: new Date(Date.now() + 60000) }), signSession: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { getCurrentUser, getCurrentUserBasic, getStorefrontUserContext } from '@/lib/auth/session';
beforeEach(() => {
  vi.clearAllMocks();
  db.$queryRaw.mockResolvedValue([{ allowed: true }]);
  db.user.findUnique.mockResolvedValue({ id: 'staff', name: 'Staff', email: 'staff@example.test', phone: null, isActive: true, roles: [{ role: { name: 'Admin', permissions: [{ permission: { key: 'product.read' } }] } }] });
  db.cart.findUnique.mockResolvedValue({ items: [{ quantity: 2 }] });
});
describe('request-scoped backoffice identity', () => {
  it('loads active identity and RBAC without reading the customer cart', async () => {
    const user = await getCurrentUser(false);
    expect(user).toMatchObject({ id: 'staff', isAdmin: true, roles: ['Admin'], permissions: ['product.read'], cartCount: 0 });
    expect(db.user.findUnique).toHaveBeenCalledOnce();
    expect(db.cart.findUnique).not.toHaveBeenCalled();
  });
  it('retains cart context for existing full-session callers', async () => {
    expect(await getCurrentUser()).toMatchObject({ cartCount: 2 });
    expect(db.cart.findUnique).toHaveBeenCalledWith({ where: { userId: 'staff' }, select: { items: { select: { quantity: true } } } });
  });
  it('rejects a deactivated identity without reading cart data', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'staff', isActive: false });
    expect(await getCurrentUser(false)).toBeNull();
    expect(db.cart.findUnique).not.toHaveBeenCalled();
  });
  it('does not retain a previous users permissions across calls', async () => {
    await getCurrentUser(false);
    db.user.findUnique.mockResolvedValue({ id: 'customer', name: 'Customer', email: 'customer@example.test', phone: null, isActive: true, roles: [] });
    expect(await getCurrentUser(false)).toMatchObject({ id: 'customer', isAdmin: false, permissions: [] });
  });
});


describe('fail-closed database authorization', () => {
  it.each([getCurrentUserBasic, getStorefrontUserContext, () => getCurrentUser(false)])('denies identity when the trusted role cannot inspect revocations %#', async read => {
    db.$queryRaw.mockResolvedValue([{ allowed: false }]);
    await expect(read()).rejects.toMatchObject({ status: 503 });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
  it.each([getCurrentUserBasic, getStorefrontUserContext, () => getCurrentUser(false)])('propagates database failure without an authenticated fallback %#', async read => {
    db.$queryRaw.mockRejectedValue(new Error('database unavailable'));
    await expect(read()).rejects.toThrow('database unavailable');
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
