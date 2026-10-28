import type { ReviewTagSample } from '@db/index.js';
import { normalizeTags } from '../tags.js';
import { DEFAULT_UNRANKED_WEIGHT, WEIGHT_DECIMALS } from './constants.js';
import type { TagWeights } from './types.js';

const roundWeight = (value: number) => {
  const factor = 10 ** WEIGHT_DECIMALS;
  return Math.round(value * factor) / factor;
};

// weight(tag) = Σ rank of the reviews carrying the tag / total reviews.
// Dividing by ALL reviews (tagged or not) makes a tag that shows up in few of them weigh less.
export function computeTagWeights(
  reviews: readonly ReviewTagSample[],
): TagWeights {
  const totalReviews = reviews.length;
  if (totalReviews === 0) {
    return {};
  }

  const rankSums = new Map<string, number>();
  reviews.forEach(({ autoRank, extractedTags }) => {
    const rank = autoRank ?? DEFAULT_UNRANKED_WEIGHT;
    normalizeTags(extractedTags).forEach((tag) => {
      rankSums.set(tag, (rankSums.get(tag) ?? 0) + rank);
    });
  });

  const weighted = [...rankSums.entries()]
    .map(([tag, sum]): [string, number] => [
      tag,
      roundWeight(sum / totalReviews),
    ])
    .sort(([tagA, a], [tagB, b]) => b - a || tagA.localeCompare(tagB));
  return Object.fromEntries(weighted);
}
