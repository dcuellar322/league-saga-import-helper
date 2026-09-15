import { buildEspnCookieHeader } from './cookies.js';
import { ESPN_IMPORT_METADATA_KEY, type EspnImportMetadata } from './payload.js';

export type EspnFetchParams = {
  leagueId: string;
  season: number;
};

type FetchOptions = {
  signal?: AbortSignal;
  helperVersion?: string;
};

export type EspnApiErrorCode = 'auth' | 'not_found' | 'rate_limited' | 'unavailable' | 'rejected';

export class EspnApiError extends Error {
  constructor(
    readonly code: EspnApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'EspnApiError';
  }
}

const LEAGUE_VIEWS = ['mSettings', 'mTeam', 'mMatchup', 'mMatchupScore', 'mStandings', 'mDraftDetail', 'mRoster'];
const MODERN_VIEWS = [...LEAGUE_VIEWS, 'mStatus'];

const MODERN_BASE_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
const LEGACY_BASE_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory';
const PUBLIC_ATHLETE_BASE_URL = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons';
const PLAYER_LOOKUP_VIEW = 'kona_player_info';

export async function fetchEspnLeaguePayload(params: EspnFetchParams, options: FetchOptions = {}): Promise<unknown> {
  const cookieHeader = await buildEspnCookieHeader();
  const modernLeagueUrl = `${MODERN_BASE_URL}/${params.season}/segments/0/leagues/${encodeURIComponent(params.leagueId)}`;
  const modernUrl = buildEspnUrl(modernLeagueUrl, MODERN_VIEWS);
  let payload: Record<string, unknown>;

  try {
    payload = normalizeEspnPayload(await fetchEspnPayload(modernUrl, cookieHeader, options));
  } catch (error) {
    if (!(error instanceof EspnApiError) || error.code !== 'not_found') throw error;
    const legacyUrl = buildEspnUrl(`${LEGACY_BASE_URL}/${encodeURIComponent(params.leagueId)}`, LEAGUE_VIEWS);
    legacyUrl.searchParams.set('seasonId', String(params.season));
    payload = normalizeLegacyPayload(await fetchEspnPayload(legacyUrl, cookieHeader, options));
  }

  return enrichEspnPayload(payload, params, modernLeagueUrl, cookieHeader, options);
}

function buildEspnUrl(input: string, views: string[]): URL {
  const url = new URL(input);
  for (const view of views) {
    url.searchParams.append('view', view);
  }
  return url;
}

async function fetchEspnPayload(
  url: URL,
  cookieHeader: string,
  options: FetchOptions,
  extraHeaders: Record<string, string> = {}
): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const timeout = AbortSignal.timeout(30_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          ...(cookieHeader ? { cookie: cookieHeader } : {}),
          'user-agent': `LeagueSaga-Import-Helper/${options.helperVersion ?? 'unknown'}`,
          ...extraHeaders
        },
        signal
      });

      if (response.ok) return response.json();
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await retryDelay(attempt, options.signal);
        continue;
      }
      throw espnStatusError(response.status);
    } catch (error) {
      if (options.signal?.aborted) throw new Error('Import canceled.');
      if (error instanceof EspnApiError) throw error;
      if (attempt < 2) {
        await retryDelay(attempt, options.signal);
        continue;
      }
      if (timeout.aborted) throw new Error('ESPN took too long to respond. Check your connection and try again.');
      throw new Error('Unable to reach ESPN. Check your connection and try again.');
    }
  }
  throw new Error('Unable to reach ESPN.');
}

async function enrichEspnPayload(
  payload: Record<string, unknown>,
  params: EspnFetchParams,
  modernLeagueUrl: string,
  cookieHeader: string,
  options: FetchOptions
): Promise<Record<string, unknown>> {
  if (!Array.isArray(payload.teams)) return payload;

  if (params.season < 2018) {
    const players = await fetchReferencedPlayers(payload, params, modernLeagueUrl, cookieHeader, options);
    return withImportMetadata(
      { ...payload, ...(players.length ? { players } : {}) },
      {
        transactionHistoryAvailable: false,
        transactionPeriodsRequested: 0,
        transactionPeriodsSupported: 0
      }
    );
  }

  const transactionResult = await fetchTransactionsByPeriod(payload, modernLeagueUrl, cookieHeader, options);
  const enrichedPayload = { ...payload, transactions: transactionResult.transactions };
  const players = await fetchReferencedPlayers(enrichedPayload, params, modernLeagueUrl, cookieHeader, options);

  return withImportMetadata(
    { ...enrichedPayload, ...(players.length ? { players } : {}) },
    {
      transactionHistoryAvailable: transactionResult.supportedPeriods > 0,
      transactionPeriodsRequested: transactionResult.requestedPeriods,
      transactionPeriodsSupported: transactionResult.supportedPeriods
    }
  );
}

async function fetchTransactionsByPeriod(
  payload: Record<string, unknown>,
  modernLeagueUrl: string,
  cookieHeader: string,
  options: FetchOptions
): Promise<{ transactions: Record<string, unknown>[]; requestedPeriods: number; supportedPeriods: number }> {
  const requestedPeriods = finalScoringPeriod(payload);
  const transactions = asRecords(payload.transactions);
  let supportedPeriods = 0;

  for (let scoringPeriod = 1; scoringPeriod <= requestedPeriods; scoringPeriod += 1) {
    const url = buildEspnUrl(modernLeagueUrl, ['mTransactions2']);
    url.searchParams.set('scoringPeriodId', String(scoringPeriod));
    const periodPayload = await fetchOptionalEspnPayload(url, cookieHeader, options);
    if (!periodPayload) continue;
    supportedPeriods += 1;
    transactions.push(
      ...asRecords(periodPayload.transactions).map((transaction) => ({
        ...transaction,
        scoringPeriodId: numericValue(transaction.scoringPeriodId) ?? scoringPeriod
      }))
    );
  }

  return {
    transactions: deduplicateTransactions(transactions),
    requestedPeriods,
    supportedPeriods
  };
}

async function fetchReferencedPlayers(
  payload: Record<string, unknown>,
  params: EspnFetchParams,
  modernLeagueUrl: string,
  cookieHeader: string,
  options: FetchOptions
): Promise<Record<string, unknown>[]> {
  const players = asRecords(payload.players);
  const knownPlayerIds = collectKnownPlayerIds(payload, players);
  const draftPlayerIds = collectPlayerIds(asRecords(asRecord(payload.draftDetail).picks));
  const transactionPlayerIds = collectPlayerIds(
    asRecords(payload.transactions).flatMap((transaction) => asRecords(transaction.items))
  );
  const unresolvedIds = [...new Set([...draftPlayerIds, ...transactionPlayerIds])].filter(
    (playerId) => !knownPlayerIds.has(playerId)
  );

  for (const playerIds of chunks(unresolvedIds, 80)) {
    const url = buildEspnUrl(modernLeagueUrl, [PLAYER_LOOKUP_VIEW]);
    const lookupPayload = await fetchOptionalEspnPayload(url, cookieHeader, options, {
      'x-fantasy-filter': JSON.stringify({ players: { filterIds: { value: playerIds.map(Number) } } })
    });
    if (!lookupPayload) continue;
    for (const player of asRecords(lookupPayload.players)) {
      const playerId = playerRecordId(player);
      if (!playerId || knownPlayerIds.has(playerId)) continue;
      knownPlayerIds.add(playerId);
      players.push(player);
    }
  }

  const unresolvedDraftIds = draftPlayerIds.filter((playerId) => !knownPlayerIds.has(playerId));
  for (const playerId of unresolvedDraftIds) {
    const url = new URL(`${PUBLIC_ATHLETE_BASE_URL}/${params.season}/athletes/${encodeURIComponent(playerId)}`);
    const player = await fetchOptionalEspnPayload(url, '', options);
    if (!player) continue;
    knownPlayerIds.add(playerId);
    players.push(player);
  }

  return players;
}

async function fetchOptionalEspnPayload(
  url: URL,
  cookieHeader: string,
  options: FetchOptions,
  extraHeaders: Record<string, string> = {}
): Promise<Record<string, unknown> | undefined> {
  try {
    const payload = await fetchEspnPayload(url, cookieHeader, options, extraHeaders);
    if (isRecord(payload)) return payload;
    if (Array.isArray(payload)) return payload.find(isRecord);
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.message === 'Import canceled.')) throw error;
  }
  return undefined;
}

function finalScoringPeriod(payload: Record<string, unknown>): number {
  const settings = asRecord(payload.settings);
  const scheduleSettings = asRecord(settings.scheduleSettings);
  const status = asRecord(payload.status);
  const candidate = numericValue(scheduleSettings.finalScoringPeriod) ?? numericValue(status.finalScoringPeriod) ?? 18;
  return Math.max(1, Math.min(candidate, 25));
}

function deduplicateTransactions(transactions: Record<string, unknown>[]): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const transaction of transactions) {
    const id = stringValue(transaction.id) ?? stringValue(transaction.transactionId);
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, transaction);
      continue;
    }
    const existingItems = asRecords(existing.items);
    const nextItems = asRecords(transaction.items);
    const richer = nextItems.length > existingItems.length ? transaction : existing;
    const other = richer === transaction ? existing : transaction;
    byId.set(id, {
      ...other,
      ...richer,
      items: asRecords(richer.items)
    });
  }
  return [...byId.values()];
}

function collectKnownPlayerIds(payload: Record<string, unknown>, players: Record<string, unknown>[]): Set<string> {
  const rosterPlayers = asRecords(payload.teams).flatMap((team) =>
    asRecords(asRecord(team.roster).entries).flatMap((entry) => {
      const pool = asRecord(entry.playerPoolEntry);
      return [asRecord(pool.player), asRecord(entry.player), pool, entry];
    })
  );
  return new Set([...players, ...rosterPlayers].map(playerRecordId).filter((id): id is string => Boolean(id)));
}

function collectPlayerIds(records: Record<string, unknown>[]): string[] {
  return records
    .map((record) => positiveIdString(record.playerId) ?? playerRecordId(record))
    .filter((id): id is string => Boolean(id));
}

function playerRecordId(record: Record<string, unknown>): string | undefined {
  const pool = asRecord(record.playerPoolEntry);
  const candidates = [asRecord(pool.player), asRecord(record.player), record, pool];
  for (const candidate of candidates) {
    const id = positiveIdString(candidate.id) ?? positiveIdString(candidate.playerId);
    if (id) return id;
  }
  return undefined;
}

function withImportMetadata(payload: Record<string, unknown>, metadata: EspnImportMetadata): Record<string, unknown> {
  return { ...payload, [ESPN_IMPORT_METADATA_KEY]: metadata };
}

function chunks<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size)
  );
}

function normalizeLegacyPayload(payload: unknown): Record<string, unknown> {
  if (isRecord(payload)) return normalizeEspnPayload(payload);
  if (Array.isArray(payload)) {
    const league = payload.find(isRecord);
    if (league) return normalizeEspnPayload(league);
  }
  throw new EspnApiError('not_found', 'ESPN could not find that league and season. Confirm both values and retry.');
}

function asRecord(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {};
}

function asRecords(input: unknown): Record<string, unknown>[] {
  return Array.isArray(input) ? input.filter(isRecord) : [];
}

function stringValue(input: unknown): string | undefined {
  if (typeof input === 'string' && input.trim()) return input;
  if (typeof input === 'number' && Number.isFinite(input)) return String(input);
  return undefined;
}

function numericValue(input: unknown): number | undefined {
  const value = typeof input === 'number' ? input : typeof input === 'string' ? Number(input) : Number.NaN;
  return Number.isInteger(value) ? value : undefined;
}

function positiveIdString(input: unknown): string | undefined {
  const value = numericValue(input);
  return value !== undefined && value > 0 ? String(value) : undefined;
}

function normalizeEspnPayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new EspnApiError('rejected', 'ESPN returned an unexpected response for that league and season.');
  }
  if (containsAuthorizationDenial(payload.messages)) {
    throw new EspnApiError(
      'auth',
      'ESPN sign-in expired or this account cannot access the league. Sign in again and retry.'
    );
  }
  return payload;
}

function containsAuthorizationDenial(input: unknown): boolean {
  return (
    Array.isArray(input) &&
    input.some(
      (message) =>
        isRecord(message) &&
        String(message.message ?? '')
          .toLowerCase()
          .includes('not authorized')
    )
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input);
}

function espnStatusError(status: number): EspnApiError {
  if (status === 401 || status === 403)
    return new EspnApiError(
      'auth',
      'ESPN sign-in expired or this account cannot access the league. Sign in again and retry.'
    );
  if (status === 404)
    return new EspnApiError('not_found', 'ESPN could not find that league and season. Confirm both values and retry.');
  if (status === 429)
    return new EspnApiError('rate_limited', 'ESPN is temporarily rate limiting imports. Wait a moment and retry.');
  if (status >= 500) return new EspnApiError('unavailable', 'ESPN is temporarily unavailable. Try again shortly.');
  return new EspnApiError('rejected', `ESPN rejected the import request (${status}).`);
}

async function retryDelay(attempt: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error('Import canceled.'));
    };
    const timeout = setTimeout(
      () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      },
      350 * 2 ** attempt
    );
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
