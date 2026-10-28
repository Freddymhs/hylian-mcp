import { env } from '@config/env.js';
import { ENV_KEYS } from '@config/constants.js';
import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import { lazy } from '@common/lazy.js';
import {
  createGameRepository,
  createLibraryRepository,
  createProfileRepository,
  createReviewRepository,
  getSupabaseClient,
} from '@db/index.js';
import type {
  AppSupabaseClient,
  GameRepository,
  LibraryRepository,
  ReviewRepository,
} from '@db/index.js';
import {
  createGameProviderService,
  createManualProvider,
  createSteamProvider,
} from '@providers/index.js';
import type { GameProviderService } from '@providers/index.js';
import { createSteamClient, createStoreClient } from './steam/index.js';
import { createProfileService } from './profile/service.js';
import type { ProfileService } from './profile/service.js';
import type { SteamClient } from './steam/index.js';
import { fromDbError } from './errors.js';
import type { ServiceError } from './errors.js';

type Provided<T> = () => Result<T, ServiceError>;

// Every dependency is resolved on first use, so the server boots without credentials
// and a tool only fails (with a message naming the variable) when it actually needs one.
export interface Services {
  steam: Provided<SteamClient>;
  games: Provided<GameRepository>;
  library: Provided<LibraryRepository>;
  reviews: Provided<ReviewRepository>;
  userId: Provided<string>;
  profile: Provided<ProfileService>;
  providers: Provided<GameProviderService>;
  /** Source of `now` for updated_at / deleted_at / cache TTL. */
  clock: () => Date;
}

function missingConfig(keys: readonly (string | false | undefined)[]) {
  const names = keys.filter(Boolean).join(', ');
  return err<ServiceError>({
    kind: 'config',
    message: `Missing environment variable(s): ${names}`,
  });
}

function createSteamFromEnv(): Result<SteamClient, ServiceError> {
  const { steamApiKey, steamId } = env;
  if (!steamApiKey || !steamId) {
    return missingConfig([
      !steamApiKey && ENV_KEYS.STEAM_API_KEY,
      !steamId && ENV_KEYS.STEAM_ID,
    ]);
  }
  return ok(createSteamClient({ apiKey: steamApiKey, steamId }));
}

function clientOrError(): Result<AppSupabaseClient, ServiceError> {
  const client = getSupabaseClient();
  return client.ok ? ok(client.value) : err(fromDbError(client.error));
}

export function createServices(): Services {
  const steam = lazy(createSteamFromEnv);

  const games = lazy((): Result<GameRepository, ServiceError> => {
    const client = clientOrError();
    return client.ok ? ok(createGameRepository(client.value)) : client;
  });

  const library = lazy((): Result<LibraryRepository, ServiceError> => {
    const client = clientOrError();
    if (!client.ok) {
      return client;
    }
    return env.userId
      ? ok(createLibraryRepository(client.value, env.userId))
      : missingConfig([ENV_KEYS.USER_ID]);
  });

  const reviews = lazy((): Result<ReviewRepository, ServiceError> => {
    const client = clientOrError();
    if (!client.ok) {
      return client;
    }
    return env.userId
      ? ok(createReviewRepository(client.value, env.userId))
      : missingConfig([ENV_KEYS.USER_ID]);
  });

  const profile = lazy((): Result<ProfileService, ServiceError> => {
    const client = clientOrError();
    if (!client.ok) {
      return client;
    }
    if (!env.userId) {
      return missingConfig([ENV_KEYS.USER_ID]);
    }
    return ok(
      createProfileService({
        reviews: createReviewRepository(client.value, env.userId),
        profile: createProfileRepository(client.value, env.userId),
      }),
    );
  });

  // Manual games first: what the user typed wins a name clash with the Steam Store.
  const providers = lazy((): Result<GameProviderService, ServiceError> => {
    const gameRepository = games();
    if (!gameRepository.ok) {
      return gameRepository;
    }
    return ok(
      createGameProviderService([
        createManualProvider(gameRepository.value),
        createSteamProvider(createStoreClient()),
      ]),
    );
  });

  const userId = lazy(
    (): Result<string, ServiceError> =>
      env.userId ? ok(env.userId) : missingConfig([ENV_KEYS.USER_ID]),
  );

  return {
    steam,
    games,
    library,
    reviews,
    userId,
    profile,
    providers,
    clock: () => new Date(),
  };
}
