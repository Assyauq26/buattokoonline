export const jntDistrictCodePattern = /^JNT-[A-Z0-9]{1,10}$/;
export const districtCodePattern = /^(?:\d{2}\.\d{2}\.\d{2}|JNT-[A-Z0-9]{1,10})$/;
// Preserve the carrier's punctuation verbatim in signed tariff requests.
export const tariffAreaPattern = /^[A-Z0-9][A-Z0-9 ._()'\/-]{0,79}$/;
