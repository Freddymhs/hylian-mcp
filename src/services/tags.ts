// "Souls-like", "souls like" and " SOULS  LIKE " are the same tag.
export function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function normalizeTags(tags: readonly string[]): string[] {
  const normalized = tags.map(normalizeTag).filter((tag) => tag !== '');
  return [...new Set(normalized)];
}
