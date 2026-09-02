import { z } from 'zod';
import type { HelperSettings } from '../shared/ipc.js';

const PRODUCTION_API_HOSTS = new Set(['portal.leaguesaga.com']);
const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DEEP_LINK_PROTOCOL = 'leaguesaga-import:';

type UrlValidationOptions = {
  allowLocalhost: boolean;
};

export const SeasonSchema = z.coerce.number().int().min(2000).max(2100);
export const OptionalSeasonSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  return value;
}, SeasonSchema.optional());

export const EspnLeagueIdSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}$/, 'ESPN league ID must be numeric.');

const MockLeagueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Mock league ID can only contain letters, numbers, underscores, and hyphens.');

const ImportSessionIdSchema = z.string().trim().min(1).max(128).optional();

const ImportTokenSchema = z.string().trim().min(1).max(4096);
const OptionalImportTokenSchema = z.string().trim().max(4096);

export function normalizeApiBaseUrl(input: string, options: UrlValidationOptions): string {
  const parsed = new URL(input.trim());

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('LeagueSaga API URL must not contain credentials, query parameters, or fragments.');
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  const normalized = `${parsed.origin}${path}`;

  if (parsed.protocol === 'https:' && PRODUCTION_API_HOSTS.has(parsed.hostname)) {
    return normalized;
  }

  if (
    options.allowLocalhost &&
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    LOCAL_API_HOSTS.has(parsed.hostname)
  ) {
    return normalized;
  }

  throw new Error('LeagueSaga API URL must be https://portal.leaguesaga.com or a local development URL.');
}

export function isAllowedLocalRendererUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'http:' && LOCAL_API_HOSTS.has(parsed.hostname) && parsed.port === '5173';
  } catch {
    return false;
  }
}

export function findDeepLinkArg(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(DEEP_LINK_PROTOCOL));
}

export function createSettingsSchema(options: UrlValidationOptions) {
  return z.object({
    apiBaseUrl: z.string().transform((value) => normalizeApiBaseUrl(value, options)),
    importToken: OptionalImportTokenSchema,
    importSessionId: ImportSessionIdSchema,
    leagueId: z.string().trim().max(64),
    season: OptionalSeasonSchema
  });
}

export const EspnOpenLoginParamsSchema = z.object({
  leagueId: EspnLeagueIdSchema.optional(),
  season: OptionalSeasonSchema
});

export const EspnImportParamsSchema = z.object({
  leagueId: EspnLeagueIdSchema,
  season: OptionalSeasonSchema,
  importSessionId: ImportSessionIdSchema
});

export const MockImportParamsSchema = z.object({
  leagueId: MockLeagueIdSchema,
  season: OptionalSeasonSchema,
  importSessionId: ImportSessionIdSchema
});

export function createUploadParamsSchema(options: UrlValidationOptions) {
  return z.object({
    apiBaseUrl: z.string().transform((value) => normalizeApiBaseUrl(value, options)),
    importToken: ImportTokenSchema,
    bundle: z.unknown()
  });
}

export function parseDeepLinkSettings(input: string, options: UrlValidationOptions): Partial<HelperSettings> | null {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== DEEP_LINK_PROTOCOL) return null;

    const settings: Partial<HelperSettings> = {};
    const apiBaseUrl = parsed.searchParams.get('apiBase');
    const importToken = parsed.searchParams.get('token');
    const importSessionId = parsed.searchParams.get('importSessionId');
    const leagueId = parsed.searchParams.get('leagueId');
    const season = parsed.searchParams.get('season');

    if (apiBaseUrl) settings.apiBaseUrl = normalizeApiBaseUrl(apiBaseUrl, options);
    if (importToken) settings.importToken = ImportTokenSchema.parse(importToken);
    if (importSessionId) settings.importSessionId = ImportSessionIdSchema.parse(importSessionId);
    if (leagueId) settings.leagueId = EspnLeagueIdSchema.parse(leagueId);
    if (season) settings.season = OptionalSeasonSchema.parse(season);

    return settings;
  } catch {
    return null;
  }
}

export function normalizeLeagueSagaNavigationUrl(input: string, options: UrlValidationOptions): string {
  const parsed = new URL(input.trim());
  if (parsed.username || parsed.password || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
    throw new Error('Invalid LeagueSaga continuation URL.');
  }
  const production = parsed.protocol === 'https:' && PRODUCTION_API_HOSTS.has(parsed.hostname);
  const local = options.allowLocalhost && LOCAL_API_HOSTS.has(parsed.hostname);
  if (!production && !local) throw new Error('Invalid LeagueSaga continuation URL.');
  return parsed.toString();
}
