/** Normalized tag → weight on the 0-100 rank scale. */
export type TagWeights = Record<string, number>;

export interface ProfileSnapshot {
  tagWeights: TagWeights;
  computedAt: string;
  fromCache: boolean;
}
