import { err, ok } from '@common/result.js';
import type {
  CachedProfile,
  DbError,
  GameRef,
  GameRepository,
  LibraryEntryInput,
  LibraryFilter,
  LibraryItem,
  LibraryRepository,
  ManualGameRecord,
  ProfileRepository,
  ReviewInput,
  ReviewRepository,
} from '@db/index.js';
import {
  readManualMetadata,
  createGameProviderService,
  createManualProvider,
  createSteamProvider,
} from '@providers/index.js';
import { createProfileService } from '@services/profile/service.js';
import type { Services } from '@services/container.js';
import type {
  SteamClient,
  SteamGame,
  StoreClient,
} from '@services/steam/index.js';
import { createFakeStore } from './fake-store.js';

export const TEST_USER_ID = '3f0c2a94-6a43-4a43-9c6e-0c6f3b9a7d11';

export interface StoredReview extends ReviewInput {
  id: string;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface StoredGame extends GameRef {
  source: 'steam' | 'manual';
  externalId: string | null;
  metadata: unknown;
}

export interface ManualGameSeed {
  name: string;
  externalId: string;
  metadata?: unknown;
}

// Fakes of our own repository ports (wire-level behaviour is covered in src/db/__tests__).
export function createInMemoryBackend() {
  const games = new Map<string, StoredGame>();
  const library = new Map<string, LibraryEntryInput>();
  const reviews: StoredReview[] = [];
  const profileCache: { current: CachedProfile | null } = { current: null };

  const findSteamGame = (appId: number) =>
    [...games.values()].find((game) => game.steamAppId === appId);

  const toManualRecord = ({
    id,
    externalId,
    name,
    metadata,
  }: StoredGame): ManualGameRecord => ({ id, externalId, name, metadata });

  const manualGames = () =>
    [...games.values()].filter(({ source }) => source === 'manual');

  const gameRepository: GameRepository = {
    async listSteamAppIds() {
      const appIds = [...games.values()].flatMap(({ steamAppId }) =>
        steamAppId === null ? [] : [steamAppId],
      );
      return ok(new Set(appIds));
    },
    async upsertSteamGames(inputs) {
      const upserted = inputs.map(({ steamAppId, name }) => {
        const existing = findSteamGame(steamAppId);
        const game: StoredGame = {
          id: existing?.id ?? crypto.randomUUID(),
          steamAppId,
          name,
          source: 'steam',
          externalId: String(steamAppId),
          metadata: existing?.metadata ?? {},
        };
        games.set(game.id, game);
        return { id: game.id, steamAppId, name };
      });
      return ok(upserted);
    },
    async findByName(name) {
      const needle = name.toLowerCase();
      const matches = [...games.values()]
        .filter((game) => game.name.toLowerCase().includes(needle))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ id, steamAppId, name: gameName }) => ({
          id,
          steamAppId,
          name: gameName,
        }));
      return ok(matches);
    },
    async searchManual(query) {
      const needle = query.toLowerCase();
      return ok(
        manualGames()
          .filter((game) => game.name.toLowerCase().includes(needle))
          .map(toManualRecord),
      );
    },
    async search({ query, source, limit }) {
      const needle = query.toLowerCase();
      const matches = (game: StoredGame) => {
        const { tags, genres } = readManualMetadata(game.metadata);
        return [game.name, ...tags, ...genres].some((text) =>
          text.toLowerCase().includes(needle),
        );
      };
      return ok(
        [...games.values()]
          .filter((game) => source === 'all' || game.source === source)
          .filter(matches)
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, limit)
          .map(({ id, source: gameSource, steamAppId, name, metadata }) => ({
            id,
            source: gameSource,
            steamAppId,
            name,
            metadata,
          })),
      );
    },
    async insertManual({ externalId, name, metadata }) {
      const game: StoredGame = {
        id: crypto.randomUUID(),
        steamAppId: null,
        name,
        source: 'manual',
        externalId,
        metadata,
      };
      games.set(game.id, game);
      return ok({ id: game.id, steamAppId: null, name });
    },
    async listManualNames() {
      return ok(manualGames().map(({ name }) => name));
    },
    async getManualByExternalId(externalId) {
      const found = manualGames().find(
        (game) => game.externalId === externalId,
      );
      return ok(found ? toManualRecord(found) : null);
    },
    async deleteById(id) {
      const game = games.get(id);
      if (!game) {
        return ok(null);
      }
      games.delete(id);
      library.delete(id);
      reviews
        .filter((review) => review.gameId === id)
        .forEach((review) => reviews.splice(reviews.indexOf(review), 1));
      return ok({ id, steamAppId: game.steamAppId, name: game.name });
    },
  };

  const libraryRepository: LibraryRepository = {
    async upsertEntries(entries) {
      entries.forEach((entry) => library.set(entry.gameId, entry));
      return ok(undefined);
    },
    async list(filter: LibraryFilter) {
      const items = [...library.values()].flatMap(
        ({ gameId, playtimeMinutes, lastPlayed }): LibraryItem[] => {
          const game = games.get(gameId);
          return game
            ? [
                {
                  gameId,
                  name: game.name,
                  steamAppId: game.steamAppId,
                  playtimeMinutes,
                  lastPlayed,
                },
              ]
            : [];
        },
      );
      const keep = (item: LibraryItem) =>
        filter === 'all' ||
        (filter === 'played'
          ? item.playtimeMinutes > 0
          : item.playtimeMinutes === 0);
      return ok(items.filter(keep));
    },
  };

  const activeReview = (id: string) =>
    reviews.find((review) => review.id === id && review.deletedAt === null);

  const reviewRepository: ReviewRepository = {
    async insert(review) {
      const stored: StoredReview = {
        id: crypto.randomUUID(),
        updatedAt: null,
        deletedAt: null,
        ...review,
      };
      reviews.push(stored);
      return ok({ id: stored.id });
    },
    async listTagSamples() {
      return ok(
        reviews
          .filter((review) => review.deletedAt === null)
          .map(({ autoRank, extractedTags }) => ({ autoRank, extractedTags })),
      );
    },
    async listForBackup() {
      return ok(
        reviews
          .filter((review) => review.deletedAt === null)
          .map((review) => {
            const game = games.get(review.gameId);
            return {
              id: review.id,
              text: review.text,
              autoRank: review.autoRank,
              extractedTags: review.extractedTags,
              createdAt: '2026-10-01T00:00:00+00:00',
              updatedAt: review.updatedAt,
              game: game
                ? {
                    id: game.id,
                    name: game.name,
                    source: game.source,
                    steamAppId: game.steamAppId,
                    externalId: game.externalId,
                    metadata: game.metadata,
                  }
                : null,
            };
          }),
      );
    },
    async update(reviewId, patch, now) {
      const review = activeReview(reviewId);
      if (!review) {
        return ok(null);
      }
      const definedFields = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      );
      Object.assign(review, definedFields, { updatedAt: now.toISOString() });
      return ok({
        id: review.id,
        gameName: games.get(review.gameId)?.name ?? '',
        text: review.text,
        autoRank: review.autoRank,
        extractedTags: review.extractedTags,
        updatedAt: review.updatedAt,
      });
    },
    async softDelete(reviewId, now) {
      const review = activeReview(reviewId);
      if (!review) {
        return ok(null);
      }
      review.deletedAt = now.toISOString();
      return ok({ id: review.id });
    },
  };

  const profileRepository: ProfileRepository = {
    async get() {
      return ok(profileCache.current);
    },
    async save(profile) {
      profileCache.current = profile;
      return ok(undefined);
    },
  };

  function addManualGame({ name, externalId, metadata = {} }: ManualGameSeed) {
    const game: StoredGame = {
      id: crypto.randomUUID(),
      steamAppId: null,
      name,
      source: 'manual',
      externalId,
      metadata,
    };
    games.set(game.id, game);
    return game;
  }

  return {
    games: gameRepository,
    library: libraryRepository,
    reviews: reviewRepository,
    profile: profileRepository,
    addManualGame,
    state: { games, library, reviews, profileCache },
  };
}

export type InMemoryBackend = ReturnType<typeof createInMemoryBackend>;

export function createFakeSteam(owned: readonly SteamGame[]): SteamClient {
  return { getOwnedGames: async () => ok([...owned]) };
}

export function createFailingSteam(message: string): SteamClient {
  return {
    getOwnedGames: async () => err({ kind: 'http', status: 403, message }),
  };
}

export const DB_FAILURE: DbError = {
  operation: 'test',
  message: 'connection reset',
};

export function sampleSteamGames(): SteamGame[] {
  return [
    {
      appId: 367520,
      name: 'Hollow Knight',
      playtimeMinutes: 3120,
      lastPlayedAt: '2023-11-14T22:13:20.000Z',
    },
    {
      appId: 10,
      name: 'Counter-Strike',
      playtimeMinutes: 0,
      lastPlayedAt: null,
    },
    {
      appId: 620,
      name: 'Portal 2',
      playtimeMinutes: 600,
      lastPlayedAt: '2024-02-01T10:00:00.000Z',
    },
    {
      appId: 400,
      name: 'Portal',
      playtimeMinutes: 240,
      lastPlayedAt: '2022-05-05T08:30:00.000Z',
    },
    {
      appId: 730,
      name: 'Counter-Strike 2',
      playtimeMinutes: 90,
      lastPlayedAt: null,
    },
  ];
}

export const TEST_NOW = new Date('2026-10-24T12:00:00.000Z');

export interface TestServicesOptions {
  store?: StoreClient;
  clock?: () => Date;
}

export function createTestServices(
  backend: InMemoryBackend,
  steam: SteamClient,
  {
    store = createFakeStore(),
    clock = () => TEST_NOW,
  }: TestServicesOptions = {},
): Services {
  const profile = createProfileService({
    reviews: backend.reviews,
    profile: backend.profile,
    clock,
  });
  const providers = createGameProviderService([
    createManualProvider(backend.games),
    createSteamProvider(store),
  ]);
  return {
    steam: () => ok(steam),
    games: () => ok(backend.games),
    library: () => ok(backend.library),
    reviews: () => ok(backend.reviews),
    userId: () => ok(TEST_USER_ID),
    profile: () => ok(profile),
    providers: () => ok(providers),
    clock,
  };
}
