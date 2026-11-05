/** Serialize form values only; lifecycle and authorization remain server responsibilities. */
export function operationPayload(form: FormData, numbers: string[], dates: string[], returnItems = false) {
  const body: Record<string, unknown> = {};
  const items: Array<{ orderItemId: string; quantity: number }> = [];
  for (const [key, value] of form) {
    if (key.startsWith("item:")) { if (Number(value) > 0) items.push({ orderItemId: key.slice(5), quantity: Number(value) }); }
    else if (numbers.includes(key)) body[key] = value === "" ? null : Number(value);
    else if (dates.includes(key)) { if (value) body[key] = new Date(String(value)).toISOString(); }
    else if (["attested", "physicalReturnVerified"].includes(key)) body[key] = value === "on";
    else body[key] = value;
  }
  if (returnItems) body.items = items;
  return body;
}
