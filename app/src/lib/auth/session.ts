import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signSession, verifySessionClaims } from "@/lib/auth/jwt";
import { activeSessionWhere, revokeSession, assertSessionRevocationAccess } from "./session-state";
import { writeAudit } from "@/modules/audit/audit.service";
import { HttpError } from "@/lib/response";
import { ADMIN_ROLES, type PermissionKey } from "@/lib/auth/permissions";

const verifyRevocationAccess = cache(assertSessionRevocationAccess);

const COOKIE = process.env.AUTH_COOKIE_NAME ?? "store_session";

export interface AuthUserBasic {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export interface StorefrontUserContext extends AuthUserBasic {
  cartCount: number;
}

export interface AuthUser extends AuthUserBasic {
  roles: string[];
  permissions: string[];
  isAdmin: boolean;
  cartCount: number;
}

export async function createSession(userId: string, email: string, expectedVersion: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId, isActive: true, sessionVersion: expectedVersion }, select: { sessionVersion: true },
  });
  if (!user) throw new HttpError("Sesi tidak valid", 401);
  const token = await signSession({ sub: userId, email, version: user.sessionVersion });
  await writeAudit({ userId, action: "auth.session.created", entity: "User", entityId: userId });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  try {
    const token = cookieStore.get(COOKIE)?.value;
    const claims = token ? await verifySessionClaims(token) : null;
    if (claims) {
      await revokeSession(claims);
      // Revocation remains durable even if audit persistence subsequently fails.
      await writeAudit({ userId: claims.sub, action: "auth.session.revoked", entity: "User", entityId: claims.sub });
    }
  } finally {
    // Delete locally even if the DB fails, but propagate failure to the caller.
    cookieStore.set(COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  }
}

export const getCurrentUserBasic = cache(async (): Promise<AuthUserBasic | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionClaims(token);
  if (!payload) return null;

  await verifyRevocationAccess();

  const user = await prisma.user.findUnique({
    where: activeSessionWhere(payload),
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
  };
});

/**
 * Single-query context for the shared storefront layout.
 * The layout needs both identity and the cart badge, so fetch them through
 * the user -> cart relation in one Prisma round-trip.
 */
export const getStorefrontUserContext = cache(
  async (): Promise<StorefrontUserContext | null> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE)?.value;
    if (!token) return null;

    const payload = await verifySessionClaims(token);
    if (!payload) return null;

  await verifyRevocationAccess();

    const user = await prisma.user.findUnique({
      where: activeSessionWhere(payload),
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        cart: {
          select: {
            items: { select: { quantity: true } },
          },
        },
      },
    });

    if (!user || !user.isActive) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      cartCount: user.cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    };
  },
);

// Layout and page guards share the same request cache key. Backoffice renders
// pass false: cart contents are not needed to authorize or render admin pages.
// This is React request memoization, never a cross-user/persistent auth cache.
export const getCurrentUser = cache(async (includeCart = true): Promise<AuthUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionClaims(token);
  if (!payload) return null;

  await verifyRevocationAccess();

  const user = await prisma.user.findUnique({
    where: activeSessionWhere(payload),
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
      roles: {
        select: {
          role: {
            select: {
              name: true,
              permissions: {
                select: { permission: { select: { key: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive) return null;

  const cart = includeCart ? await prisma.cart.findUnique({
    where: { userId: user.id },
    select: { items: { select: { quantity: true } } },
  }) : null;
  const roles = user.roles.map((r) => r.role.name);
  const permissions = Array.from(
    new Set(
      user.roles.flatMap((r) =>
        r.role.permissions.map((p) => p.permission.key),
      ),
    ),
  );

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    roles,
    permissions,
    isAdmin: roles.some((r) => ADMIN_ROLES.includes(r)),
    cartCount: cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0,
  };
});

export async function requireUserBasic(): Promise<AuthUserBasic> {
  const user = await getCurrentUserBasic();
  if (!user) throw new HttpError("Anda harus login terlebih dahulu", 401);
  return user;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError("Anda harus login terlebih dahulu", 401);
  return user;
}

export async function requirePermission(
  permission: PermissionKey,
): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) {
    throw new HttpError("Anda tidak memiliki izin untuk aksi ini", 403);
  }
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new HttpError("Akses admin diperlukan", 403);
  return user;
}
