BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "optionsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "isVariation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "combinationKey" TEXT;

-- CreateTable
CREATE TABLE "ProductOptionGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "legacyAxis" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "allowsImage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionValue" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "imageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantOptionValue" (
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,

    CONSTRAINT "ProductVariantOptionValue_pkey" PRIMARY KEY ("variantId","groupId")
);

-- CreateIndex
CREATE INDEX "ProductOptionGroup_productId_sortOrder_idx" ON "ProductOptionGroup"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionGroup_id_productId_key" ON "ProductOptionGroup"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionGroup_productId_normalizedName_key" ON "ProductOptionGroup"("productId", "normalizedName");

-- CreateIndex
CREATE INDEX "ProductOptionValue_groupId_sortOrder_idx" ON "ProductOptionValue"("groupId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductOptionValue_imageId_productId_idx" ON "ProductOptionValue"("imageId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_id_groupId_productId_key" ON "ProductOptionValue"("id", "groupId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOptionValue_groupId_normalizedValue_key" ON "ProductOptionValue"("groupId", "normalizedValue");

-- CreateIndex
CREATE INDEX "ProductVariantOptionValue_valueId_groupId_productId_idx" ON "ProductVariantOptionValue"("valueId", "groupId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_id_productId_key" ON "ProductImage"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_id_productId_key" ON "ProductVariant"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_combinationKey_key" ON "ProductVariant"("productId", "combinationKey");

-- AddForeignKey
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_groupId_productId_fkey" FOREIGN KEY ("groupId", "productId") REFERENCES "ProductOptionGroup"("id", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_imageId_productId_fkey" FOREIGN KEY ("imageId", "productId") REFERENCES "ProductImage"("id", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_variantId_productId_fkey" FOREIGN KEY ("variantId", "productId") REFERENCES "ProductVariant"("id", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantOptionValue" ADD CONSTRAINT "ProductVariantOptionValue_valueId_groupId_productId_fkey" FOREIGN KEY ("valueId", "groupId", "productId") REFERENCES "ProductOptionValue"("id", "groupId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Prisma cannot represent partial indexes or deferred cross-table constraints.
CREATE UNIQUE INDEX "ProductOptionGroup_one_image_group" ON "ProductOptionGroup" ("productId") WHERE "allowsImage";
CREATE FUNCTION store_option_canonical(input text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT lower(btrim(regexp_replace(normalize(input, NFKC), U&'[\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff]+', ' ', 'g')))
$$;
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_normalized" CHECK (id ~ '^[a-zA-Z0-9_-]{1,64}$' AND "normalizedName"=store_option_canonical(name) AND length("normalizedName") BETWEEN 1 AND 80 AND "sortOrder">=0 AND ("legacyAxis" IS NULL OR "legacyAxis" IN ('color','size')));
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_normalized" CHECK (id ~ '^[a-zA-Z0-9_-]{1,64}$' AND "normalizedValue"=store_option_canonical(value) AND length("normalizedValue") BETWEEN 1 AND 80 AND "sortOrder">=0);
ALTER TABLE "ProductOptionGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductOptionValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductVariantOptionValue" ENABLE ROW LEVEL SECURITY;
-- No public policies or public grants. App server must use a reviewed trusted role.

-- Idempotent compatibility backfill. Raw legacy columns and every variant id/SKU,
-- inventory, reservation, cart, movement and immutable order snapshot are untouched.
CREATE FUNCTION store_backfill_legacy_options(target_product text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE p record; axis text; gid text;
BEGIN
 FOR p IN SELECT id FROM "Product" WHERE NOT "optionsEnabled" AND (target_product IS NULL OR id=target_product) ORDER BY id LOOP
  DELETE FROM "ProductVariantOptionValue" WHERE "productId"=p.id;
  FOREACH axis IN ARRAY ARRAY['color','size'] LOOP
   gid := 'lg-'||md5(p.id||':'||axis);
   IF EXISTS(SELECT 1 FROM "ProductVariant" v WHERE v."productId"=p.id AND store_option_canonical(coalesce(CASE WHEN axis='color' THEN v.color ELSE v.size END,''))<>'') THEN
    INSERT INTO "ProductOptionGroup" (id,"productId",name,"normalizedName","sortOrder","legacyAxis","updatedAt")
      VALUES(gid,p.id,CASE WHEN axis='color' THEN 'Warna' ELSE 'Ukuran' END,CASE WHEN axis='color' THEN 'warna' ELSE 'ukuran' END,CASE WHEN axis='color' THEN 0 ELSE 1 END,axis,NOW()) ON CONFLICT(id) DO NOTHING;
    INSERT INTO "ProductOptionValue" (id,"productId","groupId",value,"normalizedValue","sortOrder","updatedAt")
      SELECT 'lv-'||md5(p.id||':'||axis||':'||k),p.id,gid,min(label),k,(row_number() OVER(ORDER BY k)-1)::int,NOW()
      FROM (SELECT store_option_canonical(CASE WHEN axis='color' THEN color ELSE size END) k,btrim(CASE WHEN axis='color' THEN color ELSE size END) label FROM "ProductVariant" WHERE "productId"=p.id) labels WHERE k<>'' GROUP BY k
      ON CONFLICT(id) DO NOTHING;
    INSERT INTO "ProductVariantOptionValue" ("variantId","productId","groupId","valueId")
      SELECT id,p.id,gid,'lv-'||md5(p.id||':'||axis||':'||store_option_canonical(CASE WHEN axis='color' THEN color ELSE size END)) FROM "ProductVariant"
      WHERE "productId"=p.id AND store_option_canonical(coalesce(CASE WHEN axis='color' THEN color ELSE size END,''))<>'';
   END IF;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION store_backfill_legacy_options(text) FROM PUBLIC;
SELECT store_backfill_legacy_options();

CREATE FUNCTION store_check_product_options() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE pid text; enabled boolean; group_count int;
BEGIN
 IF TG_TABLE_NAME='Product' THEN pid:=coalesce(NEW.id,OLD.id); ELSE pid:=coalesce(NEW."productId",OLD."productId"); END IF;
 SELECT "optionsEnabled" INTO enabled FROM "Product" WHERE id=pid;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM "ProductOptionValue" v JOIN "ProductOptionGroup" g ON g.id=v."groupId" WHERE v."productId"=pid AND v."imageId" IS NOT NULL AND NOT g."allowsImage") THEN RAISE EXCEPTION 'Only the image-enabled group can reference images' USING ERRCODE='23514'; END IF;
 IF enabled THEN
  SELECT count(*) INTO group_count FROM "ProductOptionGroup" WHERE "productId"=pid;
  IF group_count NOT BETWEEN 1 AND 3 OR (SELECT count(*) FROM "ProductVariant" WHERE "productId"=pid) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Custom variation limits violated' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM "ProductOptionGroup" g WHERE g."productId"=pid AND (SELECT count(*) FROM "ProductOptionValue" WHERE "groupId"=g.id) NOT BETWEEN 1 AND 50) THEN RAISE EXCEPTION 'Option value limits violated' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM "ProductVariant" v WHERE v."productId"=pid AND (v."combinationKey" IS NULL OR v."combinationKey"<>(SELECT string_agg(s."valueId",'|' ORDER BY s."valueId" COLLATE "C") FROM "ProductVariantOptionValue" s WHERE s."variantId"=v.id) OR (SELECT count(*) FROM "ProductVariantOptionValue" s WHERE s."variantId"=v.id)<>group_count)) THEN RAISE EXCEPTION 'Variant must select exactly one value from every group with its canonical key' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Product_options_integrity" AFTER INSERT OR UPDATE ON "Product" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_check_product_options();
CREATE CONSTRAINT TRIGGER "ProductOptionGroup_integrity" AFTER INSERT OR UPDATE OR DELETE ON "ProductOptionGroup" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_check_product_options();
CREATE CONSTRAINT TRIGGER "ProductOptionValue_integrity" AFTER INSERT OR UPDATE OR DELETE ON "ProductOptionValue" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_check_product_options();
CREATE CONSTRAINT TRIGGER "ProductVariant_options_integrity" AFTER INSERT OR UPDATE OR DELETE ON "ProductVariant" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_check_product_options();
CREATE CONSTRAINT TRIGGER "ProductVariantOptionValue_integrity" AFTER INSERT OR UPDATE OR DELETE ON "ProductVariantOptionValue" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION store_check_product_options();
COMMIT;
