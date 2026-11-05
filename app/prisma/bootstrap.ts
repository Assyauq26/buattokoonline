import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ROLE_PERMISSIONS } from "../src/lib/auth/permissions";
import { makeDefault } from "../src/modules/appearance/schema";

// NUL-delimited stdin: never command arguments, environment variables or log output.
const inputSchema = z.tuple([
  z.string().trim().min(1).max(100).refine(s => !/[\x00-\x1f\x7f]/.test(s)),
  z.string().trim().email().max(254).transform(s => s.toLowerCase()),
  z.string().min(12).refine(s => Buffer.byteLength(s, "utf8") <= 72, "Password exceeds bcrypt limit"),
]);
const prisma = new PrismaClient();
async function main() {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 4096) throw new Error("Input too large");
    chunks.push(Buffer.from(chunk));
  }
  const [name, email, password] = inputSchema.parse(Buffer.concat(chunks).toString("utf8").split("\0"));
  const passwordHash = await bcrypt.hash(password, 12);
  const config = makeDefault(); config.identity.name = name;
  const json = config as unknown as Prisma.InputJsonValue;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('store-bootstrap'))::text`;
    if (await tx.user.count() || await tx.storeAppearance.count()) throw new Error("Store is already initialized");
    for (const [roleName, keys] of Object.entries(ROLE_PERMISSIONS)) {
      const role = await tx.role.upsert({ where: { name: roleName }, create: { name: roleName, label: roleName }, update: {} });
      for (const key of keys) {
        const permission = await tx.permission.upsert({ where: { key }, create: { key, label: key }, update: {} });
        await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
      }
    }
    const role = await tx.role.findUniqueOrThrow({ where: { name: "Admin" } });
    await tx.user.create({ data: { name: `Admin ${name}`, email, passwordHash, emailVerifiedAt: new Date(), roles: { create: { roleId: role.id } } } });
    await tx.storeAppearance.create({ data: { key: "primary", draft: json, published: json } });
  }, { timeout: 30000 });
  console.log("Store identity and administrator created. Catalog and customer data remain empty.");
}
main().catch(() => { console.error("Bootstrap failed: check input and ensure the store has not already been initialized."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
