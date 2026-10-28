import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import type { GameRepository, LibraryRepository } from '@db/index.js';
import type { SteamClient, SteamGame } from './steam/index.js';
import { fromDbError, fromSteamError } from './errors.js';
import type { ServiceError } from './errors.js';
import { minutesToHours } from './playtime.js';

export interface SyncSummary {
  synced: number;
  newGames: number;
  /** Hours across the whole synced library, one decimal. */
  totalPlaytime: number;
}

export interface LibrarySyncDeps {
  steam: SteamClient;
  games: GameRepository;
  library: LibraryRepository;
}

// Steam should not repeat an appid, but a duplicate key inside one upsert aborts the whole statement.
function dedupeByAppId(games: readonly SteamGame[]): SteamGame[] {
  return [...new Map(games.map((game) => [game.appId, game])).values()];
}

export async function syncLibrary({
  steam,
  games,
  library,
}: LibrarySyncDeps): Promise<Result<SyncSummary, ServiceError>> {
  const owned = await steam.getOwnedGames();
  if (!owned.ok) {
    return err(fromSteamError(owned.error));
  }
  const steamGames = dedupeByAppId(owned.value);

  const known = await games.listSteamAppIds();
  if (!known.ok) {
    return err(fromDbError(known.error));
  }
  const newGames = steamGames.filter(({ appId }) => !known.value.has(appId));

  const upserted = await games.upsertSteamGames(
    steamGames.map(({ appId, name }) => ({ steamAppId: appId, name })),
  );
  if (!upserted.ok) {
    return err(fromDbError(upserted.error));
  }
  const gameIdByAppId = new Map(
    upserted.value.map(({ steamAppId, id }) => [steamAppId, id]),
  );

  const entries = steamGames.flatMap(
    ({ appId, playtimeMinutes, lastPlayedAt }) => {
      const gameId = gameIdByAppId.get(appId);
      return gameId === undefined
        ? []
        : [{ gameId, playtimeMinutes, lastPlayed: lastPlayedAt }];
    },
  );
  const stored = await library.upsertEntries(entries);
  if (!stored.ok) {
    return err(fromDbError(stored.error));
  }

  const totalMinutes = steamGames.reduce(
    (sum, { playtimeMinutes }) => sum + playtimeMinutes,
    0,
  );
  return ok({
    synced: steamGames.length,
    newGames: newGames.length,
    totalPlaytime: minutesToHours(totalMinutes),
  });
}
