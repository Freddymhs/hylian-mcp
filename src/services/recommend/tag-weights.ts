import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import type { ServiceError } from '../errors.js';
import type { ProfileService } from '../profile/service.js';
import type { TagWeights } from '../profile/types.js';
import { NO_PROFILE_MESSAGE } from './constants.js';

// Every ranking needs a non-empty profile: without tagged reviews there is nothing to match against.
export async function loadTagWeights(
  profile: ProfileService,
): Promise<Result<TagWeights, ServiceError>> {
  const snapshot = await profile.get();
  if (!snapshot.ok) {
    return err(snapshot.error);
  }
  const { tagWeights } = snapshot.value;
  if (Object.keys(tagWeights).length === 0) {
    return err({ kind: 'not_found', message: NO_PROFILE_MESSAGE });
  }
  return ok(tagWeights);
}
