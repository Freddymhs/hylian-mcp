import type { Services } from '@services/container.js';

// Reviews feed the taste profile: refresh it after any change. A profile that cannot be
// reached (no credentials, DB down) never blocks the review operation itself.
export async function refreshProfile(services: Services): Promise<void> {
  const profile = services.profile();
  if (profile.ok) {
    await profile.value.refreshQuietly();
  }
}
