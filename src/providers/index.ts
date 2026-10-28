export { createSteamProvider } from './steam.provider.js';
export { createManualProvider } from './manual.provider.js';
export {
  MAX_RELEASE_YEAR,
  MIN_RELEASE_YEAR,
  manualMetadataSchema,
  readManualMetadata,
} from './manual-metadata.js';
export { createGameProviderService } from './game-provider.service.js';
export type { ManualMetadata } from './manual-metadata.js';
export type {
  GameProviderService,
  SearchOutcome,
} from './game-provider.service.js';
export type {
  Game,
  GameProvider,
  ProviderError,
  ProviderErrorKind,
} from './types.js';
