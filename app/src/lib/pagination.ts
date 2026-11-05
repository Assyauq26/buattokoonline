/** Fetch independent list/count queries together; retain the existing last-page clamp. */
export async function readPage<T>(
  requestedPage: number,
  count: () => PromiseLike<number>,
  read: (skip: number, take: number) => PromiseLike<T[]>,
  pageSize = 20,
) {
  const requested = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100_000) : 1;
  const [total, initial] = await Promise.all([count(), read((requested - 1) * pageSize, pageSize)]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, pages);
  const rows = page === requested ? initial : await read((page - 1) * pageSize, pageSize);
  return { total, pages, page, rows };
}
