import {
  IMPORT_CONTRACT_VERSION,
  validateHistoryImport,
  type LeagueSagaHistoryImport,
  type LeagueSagaHistorySeason
} from '@leaguesaga/import-contract';
import { EspnApiError, fetchEspnLeaguePayload } from './api.js';
import { transformEspnPayload, type TransformContext } from './transform.js';

type HistoryImportParams = {
  leagueId: string;
  startYear?: number;
  importSessionId?: string;
};

type HistoryImportContext = {
  currentSeason: number;
  helperVersion: string;
  platform: string;
  signal?: AbortSignal;
};

type HistoryDependencies = {
  fetchSeason: typeof fetchEspnLeaguePayload;
  transformSeason: typeof transformEspnPayload;
};

const DEFAULT_DEPENDENCIES: HistoryDependencies = {
  fetchSeason: fetchEspnLeaguePayload,
  transformSeason: transformEspnPayload
};

export async function importEspnHistory(
  params: HistoryImportParams,
  context: HistoryImportContext,
  dependencies: HistoryDependencies = DEFAULT_DEPENDENCIES
): Promise<LeagueSagaHistoryImport> {
  if (params.startYear !== undefined && params.startYear > context.currentSeason) {
    throw new Error(`Start year cannot be later than the current ESPN season (${context.currentSeason}).`);
  }

  const payloads = new Map<number, unknown>();
  const warnings: string[] = [];
  let seasonYears: number[];

  if (params.startYear === undefined) {
    const currentPayload = await dependencies.fetchSeason(
      { leagueId: params.leagueId, season: context.currentSeason },
      { signal: context.signal }
    );
    payloads.set(context.currentSeason, currentPayload);
    seasonYears = discoverEspnSeasonYears(currentPayload, context.currentSeason);
    if (seasonYears.length === 1) {
      warnings.push('ESPN did not report any linked previous seasons for this league.');
    }
  } else {
    seasonYears = inclusiveSeasonRange(params.startYear, context.currentSeason);
  }

  const seasons: LeagueSagaHistorySeason[] = [];
  for (const season of seasonYears) {
    if (context.signal?.aborted) throw new Error('Import canceled.');
    try {
      const payload =
        payloads.get(season) ??
        (await dependencies.fetchSeason({ leagueId: params.leagueId, season }, { signal: context.signal }));
      const transformContext: TransformContext = {
        leagueId: params.leagueId,
        season
      };
      seasons.push(dependencies.transformSeason(payload, transformContext));
    } catch (error) {
      if (error instanceof EspnApiError && error.code === 'not_found') {
        warnings.push(`ESPN season ${season} was not available and was skipped.`);
        continue;
      }
      throw error;
    }
  }

  if (!seasons.length) {
    throw new Error(
      'ESPN did not return any importable seasons for this league. Confirm the league ID and start year.'
    );
  }

  seasons.sort((left, right) => left.season - right.season);
  const latestSeason = seasons.at(-1)!;
  return validateHistoryImport({
    kind: 'league-history',
    contractVersion: IMPORT_CONTRACT_VERSION,
    provider: 'espn',
    generatedAt: new Date().toISOString(),
    helper: {
      name: 'LeagueSaga Import Helper',
      version: context.helperVersion,
      platform: context.platform
    },
    importSessionId: params.importSessionId,
    leagueExternalId: params.leagueId,
    leagueName: latestSeason.league.name,
    startSeason: seasons[0]!.season,
    endSeason: latestSeason.season,
    seasons,
    warnings
  });
}

export function discoverEspnSeasonYears(payload: unknown, currentSeason: number): number[] {
  const data = asRecord(payload);
  const status = asRecord(data.status);
  const settings = asRecord(data.settings);
  const candidates = [data.previousSeasons, status.previousSeasons, settings.previousSeasons];
  const seasons = new Set<number>([currentSeason]);

  for (const candidate of candidates) {
    for (const value of seasonValues(candidate)) {
      if (value >= 2000 && value <= currentSeason) seasons.add(value);
    }
  }

  return [...seasons].sort((left, right) => left - right);
}

export function inclusiveSeasonRange(startYear: number, endYear: number): number[] {
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear < 2000 || endYear > 2100) {
    throw new Error('Season range must contain whole years from 2000 to 2100.');
  }
  if (startYear > endYear) return [];
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

function seasonValues(input: unknown): number[] {
  const values = Array.isArray(input)
    ? input
    : input && typeof input === 'object'
      ? Object.entries(input as Record<string, unknown>).flatMap(([key, value]) => [key, value])
      : [];
  return values.flatMap((value) => {
    if (typeof value === 'number' || typeof value === 'string') {
      const season = Number(value);
      return Number.isInteger(season) ? [season] : [];
    }
    const record = asRecord(value);
    const season = Number(record.seasonId ?? record.season ?? record.year ?? record.id);
    return Number.isInteger(season) ? [season] : [];
  });
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}
