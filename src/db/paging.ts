import { ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import type { DbError } from './errors.js';
import { DB_PAGE_SIZE } from './constants.js';

// PostgREST caps responses at DB_PAGE_SIZE rows: keep asking until a short page arrives.
export async function collectPages<T>(
  fetchPage: (offset: number) => Promise<Result<T[], DbError>>,
  offset = 0,
  collected: readonly T[] = [],
): Promise<Result<T[], DbError>> {
  const page = await fetchPage(offset);
  if (!page.ok) {
    return page;
  }
  const all = [...collected, ...page.value];
  const isLastPage = page.value.length < DB_PAGE_SIZE;
  return isLastPage
    ? ok(all)
    : collectPages(fetchPage, offset + DB_PAGE_SIZE, all);
}
