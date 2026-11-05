import type { PrismaClient } from "@prisma/client";
/** Read-only release gate: validate the relation and unique identity, not counts alone. */
export async function assertReviewSchema(db: PrismaClient) {
  const [row] = await db.$queryRaw<
    { columnOk: boolean; uniqueOk: boolean; foreignOk: boolean }[]
  >`
 SELECT
 EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public."Review"'::regclass AND attname='orderItemId' AND NOT attnotnull AND NOT attisdropped) AS "columnOk",
 EXISTS(SELECT 1 FROM pg_index x JOIN pg_attribute a ON a.attrelid=x.indrelid AND a.attname='orderItemId'
 WHERE x.indrelid='public."Review"'::regclass AND x.indisunique AND x.indisvalid AND x.indisready AND x.indpred IS NULL AND x.indkey::text=a.attnum::text) AS "uniqueOk",
 EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='orderItemId'
 JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attname='id'
 WHERE c.conrelid='public."Review"'::regclass AND c.confrelid='public."OrderItem"'::regclass AND c.contype='f' AND c.convalidated AND c.confdeltype='n'
 AND c.conkey=ARRAY[a.attnum] AND c.confkey=ARRAY[b.attnum]) AS "foreignOk"`;
  if (!row?.columnOk || !row.uniqueOk || !row.foreignOk)
    throw new Error("Verified review schema gate failed");
}
