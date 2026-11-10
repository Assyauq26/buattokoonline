import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { saveSellerContact } from "@/modules/admin/seller-profile.service";
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/management_v130_test"
)
  throw Error("Local disposable DB only");
let id: string, customer: string;
beforeAll(async () => {
  const role = await prisma.role.upsert({
    where: { name: "Admin" },
    update: {},
    create: { name: "Admin", label: "Test admin" },
  });
  id = (
    await prisma.user.create({
      data: {
        name: "Seller",
        email: randomUUID() + "@example.test",
        phone: "+628" + Date.now().toString().slice(-10),
        passwordHash: "unchanged-hash",
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: role.id } },
      },
    })
  ).id;
  customer = (
    await prisma.user.create({
      data: {
        name: "Customer",
        email: randomUUID() + "@example.test",
        passwordHash: "test",
      },
    })
  ).id;
});
afterAll(async () => prisma.$disconnect());
it("persists a separate contact and clear value without changing identity or sessions", async () => {
  const before = await prisma.user.findUniqueOrThrow({ where: { id } });
  const first = await saveSellerContact(id, {
    name: "Seller Baru",
    phone: "0812 3456 7890",
    revision: before.updatedAt.toISOString(),
  });
  let current = await prisma.user.findUniqueOrThrow({ where: { id } });
  expect(current.sellerContactPhone).toBe("+6281234567890");
  for (const key of [
    "phone",
    "email",
    "passwordHash",
    "sessionVersion",
    "emailVerifiedAt",
  ] as const)
    expect(current[key]).toEqual(before[key]);
  await saveSellerContact(id, {
    name: first.name,
    phone: "",
    revision: first.revision,
  });
  current = await prisma.user.findUniqueOrThrow({ where: { id } });
  expect(current.sellerContactPhone).toBe("");
  expect(current.phone).toBe(before.phone);
});
it("serializes concurrent saves and prevents stale overwrite", async () => {
  const current = await prisma.user.findUniqueOrThrow({ where: { id } });
  const results = await Promise.allSettled(
    [1, 2].map((i) =>
      saveSellerContact(id, {
        name: "Seller " + i,
        phone: "081234567890",
        revision: current.updatedAt.toISOString(),
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
it("denies customer and target identity injection", async () => {
  const current = await prisma.user.findUniqueOrThrow({
    where: { id: customer },
  });
  await expect(
    saveSellerContact(customer, {
      name: "Injected",
      phone: "081234567890",
      revision: current.updatedAt.toISOString(),
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    saveSellerContact(id, {
      name: "Injected",
      phone: "081234567890",
      revision: current.updatedAt.toISOString(),
      id: customer,
    }),
  ).rejects.toMatchObject({ status: 422 });
});
