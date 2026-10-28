import { z } from 'zod';

export const MIN_RELEASE_YEAR = 1950;
export const MAX_RELEASE_YEAR = 2100;

// What add_manual_game stores in games.metadata and ManualProvider reads back.
// The user's input is the source of truth: `genres` count as tags for matching and search.
export const manualMetadataSchema = z.object({
  genres: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  releaseYear: z
    .number()
    .int()
    .min(MIN_RELEASE_YEAR)
    .max(MAX_RELEASE_YEAR)
    .nullable()
    .default(null),
  developer: z.string().nullable().default(null),
  priceUSD: z.number().nonnegative().nullable().default(null),
  description: z.string().default(''),
  storeUrl: z.string().url().nullable().default(null),
});

export type ManualMetadata = z.infer<typeof manualMetadataSchema>;

// Unreadable metadata degrades to "no extra info" instead of hiding the game.
export function readManualMetadata(metadata: unknown): ManualMetadata {
  const parsed = manualMetadataSchema.safeParse(metadata ?? {});
  return parsed.success ? parsed.data : manualMetadataSchema.parse({});
}
