ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD CONSTRAINT "User_deleted_inactive" CHECK ("deletedAt" IS NULL OR "isActive" = false);
INSERT INTO "Permission" ("id", "key", "label") VALUES
('customer_update_v130', 'customer.update', 'Manage customer profile and recovery'),
('customer_delete_v130', 'customer.delete', 'Anonymize customer account') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE r."name" = 'Admin' AND p."key" IN ('customer.update', 'customer.delete') ON CONFLICT DO NOTHING;
