export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) {
    throw new RangeError(`chunk size must be >= 1, got ${size}`);
  }
  const chunkCount = Math.ceil(items.length / size);
  return Array.from({ length: chunkCount }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}
