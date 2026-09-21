/**
 * Server-side paging helpers. Lists that grow without bound (members, debts,
 * archive…) are read one page at a time so the first paint stays fast no
 * matter how large the gym gets. Client-safe.
 */
export const DEFAULT_PAGE_SIZE = 25;

export type PageInfo = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  from: number;
  to: number;
};

/** Parse `?page=` safely — never below 1, never non-numeric. */
export function pageFrom(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Prisma `skip`/`take` for a page. */
export function pageSlice(page: number, pageSize = DEFAULT_PAGE_SIZE) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Everything the pager needs, with the page clamped to what exists. */
export function pageInfo(page: number, total: number, pageSize = DEFAULT_PAGE_SIZE): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  return { page: current, pageSize, total, pageCount, from, to };
}
