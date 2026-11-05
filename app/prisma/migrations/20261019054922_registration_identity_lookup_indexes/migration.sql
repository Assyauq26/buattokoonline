-- Additive, non-unique indexes: preserve existing rows and identity constraints.
-- Plain CREATE INDEX is transactional; requires an approved, bounded write-drain window.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE INDEX "User_registration_email_normalized_idx" ON "User" ((lower(btrim("email", U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'))));
CREATE INDEX "User_registration_phone_normalized_idx" ON "User" ((CASE WHEN translate(coalesce("phone", ''), U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff().-', '') LIKE '0%' THEN '+62' || substring(translate(coalesce("phone", ''), U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff().-', '') FROM 2) WHEN translate(coalesce("phone", ''), U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff().-', '') LIKE '62%' THEN '+' || translate(coalesce("phone", ''), U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff().-', '') ELSE translate(coalesce("phone", ''), U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff().-', '') END));
COMMIT;
