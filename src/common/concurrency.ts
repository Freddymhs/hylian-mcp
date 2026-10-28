import { chunk } from './chunk.js';

// Runs `task` over `items` in waves of `limit`, keeping the input order in the output.
export async function mapInBatches<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (const batch of chunk(items, limit)) {
    results.push(...(await Promise.all(batch.map(task))));
  }
  return results;
}
