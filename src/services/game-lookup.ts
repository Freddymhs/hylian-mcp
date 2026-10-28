import { err, ok } from '@common/result.js';
import type { Result } from '@common/result.js';
import type { GameRef, GameRepository } from '@db/index.js';
import { fromDbError } from './errors.js';
import type { ServiceError } from './errors.js';

const normalize = (value: string) => value.trim().toLowerCase();

// "Portal" matches "Portal" and "Portal 2": an exact name wins, otherwise the
// partial match must be unique so a review never lands on the wrong game.
export async function resolveGameByName(
  games: GameRepository,
  name: string,
): Promise<Result<GameRef, ServiceError>> {
  const query = name.trim();
  const found = await games.findByName(query);
  if (!found.ok) {
    return err(fromDbError(found.error));
  }

  const candidates = found.value;
  const exact = candidates.filter(
    (game) => normalize(game.name) === normalize(query),
  );
  const [onlyExact] = exact;
  if (exact.length === 1 && onlyExact) {
    return ok(onlyExact);
  }

  const [first] = candidates;
  if (candidates.length === 1 && first) {
    return ok(first);
  }
  if (candidates.length === 0) {
    return err({
      kind: 'not_found',
      message: `Game "${query}" not found. Run sync_library first or use add_manual_game`,
    });
  }
  const names = candidates.map((game) => `"${game.name}"`).join(', ');
  return err({
    kind: 'ambiguous',
    message: `"${query}" matches several games: ${names}. Use the full name`,
  });
}
