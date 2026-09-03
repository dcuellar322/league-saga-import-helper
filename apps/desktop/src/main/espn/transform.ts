import {
  validateHistorySeason,
  type LeagueSagaHistoryDraftPick,
  type LeagueSagaHistoryMatchup,
  type LeagueSagaHistoryPlayer,
  type LeagueSagaHistoryRosterEntry,
  type LeagueSagaHistorySeason,
  type LeagueSagaHistoryTeam,
  type LeagueSagaHistoryTeamTradePartnerSummary,
  type LeagueSagaHistoryTeamTransactionSummary,
  type LeagueSagaHistoryTransaction,
  type LeagueSagaHistoryTransactionCoverage,
  type NormalizedLeagueSettings
} from '@leaguesaga/import-contract';
import { ESPN_IMPORT_METADATA_KEY } from './payload.js';

export type TransformContext = {
  leagueId: string;
  season: number;
};

export function transformEspnPayload(payload: unknown, context: TransformContext): LeagueSagaHistorySeason {
  const data = asRecord(payload);
  const leagueExternalId = String(data.id ?? context.leagueId);
  const settings = asRecord(data.settings);
  const leagueName = asString(settings.name) ?? asString(data.name) ?? `ESPN League ${leagueExternalId}`;
  const teamsRaw = asArray(data.teams);
  const scheduleRaw = asArray(data.schedule);
  const draftDetail = asRecord(data.draftDetail);
  const transactionsRaw = normalizeTransactionRows(asArray(data.transactions));
  const memberNames = buildMemberNameMap(asArray(data.members));

  const teams = teamsRaw.map((team) => mapTeam(team, memberNames)).filter(Boolean) as LeagueSagaHistoryTeam[];
  const rosterEntries = teamsRaw.flatMap((team) => mapRosterEntries(team));
  const playerLookup = buildPlayerLookup(asArray(data.players), rosterEntries);
  const matchups = scheduleRaw
    .map((matchup) => mapMatchup(matchup, context.season))
    .filter(Boolean) as LeagueSagaHistoryMatchup[];
  const draftPicks = asArray(draftDetail.picks)
    .map((pick) => mapDraftPick(pick, leagueExternalId, context.season, playerLookup))
    .filter(Boolean) as LeagueSagaHistoryDraftPick[];
  const transactions = transactionsRaw
    .map((transaction) => mapTransaction(transaction, playerLookup))
    .filter(Boolean) as LeagueSagaHistoryTransaction[];
  const transactionSummaries = teamsRaw
    .map(mapTransactionSummary)
    .filter(Boolean) as LeagueSagaHistoryTeamTransactionSummary[];
  const tradePartnerSummaries = mapTradePartnerSummaries(transactions);

  if (!teams.length) {
    throw new Error('ESPN returned no teams. Check the league ID, season, and account access, then try again.');
  }

  const unresolvedPlayers = [
    ...draftPicks.flatMap((pick) => (pick.player ? [pick.player] : [])),
    ...transactions.flatMap((transaction) => transaction.items.flatMap((item) => (item.player ? [item.player] : [])))
  ].filter((player) => player.fullName.startsWith('ESPN Player ')).length;
  const unresolvedTransactionPlayers = transactions
    .flatMap((transaction) => transaction.items.flatMap((item) => (item.player ? [item.player] : [])))
    .filter((player) => player.fullName.startsWith('ESPN Player ')).length;
  const transactionCoverage = mapTransactionCoverage(data, context.season, unresolvedTransactionPlayers);
  const warnings: string[] = [];
  if (!rosterEntries.length)
    warnings.push(
      'No roster entries were found. ESPN may have returned limited data or the season may be unavailable.'
    );
  warnings.push(...transactionCoverage.limitations);
  if (unresolvedPlayers)
    warnings.push(
      `${unresolvedPlayers} draft or transaction player names were unavailable; ESPN player IDs were preserved for matching.`
    );

  const historySeason: LeagueSagaHistorySeason = {
    season: context.season,
    league: {
      name: leagueName,
      size: teams.length,
      scoringPeriodId: numberOrUndefined(data.scoringPeriodId),
      visibility:
        asBoolean(settings.isPublic) === true
          ? 'public'
          : asBoolean(settings.isPublic) === false
            ? 'private'
            : 'unknown',
      settings: normalizeLeagueSettings(settings)
    },
    teams,
    rosterEntries,
    matchups,
    draftPicks,
    transactions,
    transactionCoverage,
    transactionSummaries,
    tradePartnerSummaries,
    warnings
  };

  return validateHistorySeason(historySeason);
}

function mapTeam(input: unknown, memberNames: Map<string, string>): LeagueSagaHistoryTeam | null {
  const team = asRecord(input);
  const id = asString(team.id) ?? asString(team.teamId);
  if (!id) return null;

  const location = asString(team.location);
  const nickname = asString(team.nickname);
  const displayName = [location, nickname].filter(Boolean).join(' ').trim() || asString(team.name) || `Team ${id}`;
  const owners = asArray(team.owners).flatMap((owner) => {
    const name = memberNames.get(String(owner));
    return name ? [name] : [];
  });
  const primaryOwnerName = memberNames.get(String(team.primaryOwner));
  if (primaryOwnerName) {
    const existingIndex = owners.indexOf(primaryOwnerName);
    if (existingIndex >= 0) owners.splice(existingIndex, 1);
    owners.unshift(primaryOwnerName);
  }

  return {
    externalId: id,
    abbreviation: asString(team.abbrev),
    location,
    nickname,
    displayName,
    ownerDisplayNames: owners,
    logoUrl: maybeUrl(teamLogo(team)),
    playoffSeed: positiveIntegerOrUndefined(team.playoffSeed),
    finalStanding:
      positiveIntegerOrUndefined(team.finalStanding) ??
      positiveIntegerOrUndefined(team.rankCalculatedFinal) ??
      positiveIntegerOrUndefined(team.rankFinal)
  };
}

function mapRosterEntries(input: unknown): LeagueSagaHistoryRosterEntry[] {
  const team = asRecord(input);
  const teamId = asString(team.id) ?? asString(team.teamId);
  if (!teamId) return [];

  return asArray(asRecord(team.roster).entries).flatMap((entry) => {
    const record = asRecord(entry);
    const playerPoolEntry = asRecord(record.playerPoolEntry);
    const player = mapPlayer(record);
    if (!player) return [];
    return [
      {
        teamExternalId: teamId,
        player,
        lineupSlot: lineupSlotName(record.lineupSlotId),
        acquisitionType: asString(record.acquisitionType),
        acquisitionDate: dateFromMaybeEpoch(record.acquisitionDate),
        injuryStatus: firstString(playerCandidates(record), 'injuryStatus') ?? asString(playerPoolEntry.injuryStatus)
      }
    ];
  });
}

function mapPlayer(input: unknown): LeagueSagaHistoryPlayer | null {
  const candidates = playerCandidates(input);
  const id = firstString(candidates, 'id') ?? firstString(candidates, 'playerId');
  if (!id) return null;

  const firstName = firstString(candidates, 'firstName');
  const lastName = firstString(candidates, 'lastName');
  const fallbackName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const fullName =
    firstString(candidates, 'fullName') ??
    firstString(candidates, 'displayName') ??
    firstString(candidates, 'playerName') ??
    (fallbackName || `ESPN Player ${id}`);

  return {
    externalId: id,
    fullName,
    firstName,
    lastName,
    proTeam: firstString(candidates, 'proTeamAbbrev') ?? firstString(candidates, 'proTeamId'),
    positions: candidates.flatMap(playerPositions).slice(0, 1),
    jersey: firstString(candidates, 'jersey'),
    status: firstString(candidates, 'injuryStatus') ?? firstString(candidates, 'status')
  };
}

function mapMatchup(input: unknown, season: number): LeagueSagaHistoryMatchup | null {
  const matchup = asRecord(input);
  const id =
    asString(matchup.id) ??
    `${season}-${asString(matchup.matchupPeriodId) ?? 'unknown'}-${asString(asRecord(matchup.home).teamId) ?? 'home'}-${asString(asRecord(matchup.away).teamId) ?? 'away'}`;
  const scoringPeriodId = numberOrUndefined(matchup.matchupPeriodId) ?? numberOrUndefined(matchup.scoringPeriodId);
  if (!scoringPeriodId) return null;

  const home = mapMatchupSide(matchup.home);
  const away = mapMatchupSide(matchup.away);
  const winner = asString(matchup.winner)?.toUpperCase();
  if (home && winner === 'HOME') home.winner = true;
  if (away && winner === 'AWAY') away.winner = true;
  const winnerTeamExternalId =
    home?.winner || (home?.score !== undefined && away?.score !== undefined && home.score > away.score)
      ? home?.teamExternalId
      : away?.winner || (home?.score !== undefined && away?.score !== undefined && away.score > home.score)
        ? away?.teamExternalId
        : undefined;

  return {
    externalId: id,
    scoringPeriodId,
    home,
    away,
    winnerTeamExternalId,
    playoffTierType: asString(matchup.playoffTierType)
  };
}

function mapMatchupSide(input: unknown) {
  const side = asRecord(input);
  const teamExternalId = positiveIdString(side.teamId);
  if (!teamExternalId) return undefined;
  return {
    teamExternalId,
    score: numberOrUndefined(side.totalPoints),
    projectedScore: numberOrUndefined(side.totalProjectedPointsLive),
    winner: asString(side.winner) === 'WIN' || side.winner === true
  };
}

function mapDraftPick(
  input: unknown,
  leagueExternalId: string,
  season: number,
  players: Map<string, LeagueSagaHistoryPlayer>
): LeagueSagaHistoryDraftPick | null {
  const pick = asRecord(input);
  const overallPick = positiveIntegerOrUndefined(pick.overallPickNumber) ?? positiveIntegerOrUndefined(pick.pickNumber);
  const teamExternalId = positiveIdString(pick.teamId);
  const playerId = asString(pick.playerId);
  const numericPlayerId = numberOrUndefined(playerId);
  const lineupSlotId = numberOrUndefined(pick.lineupSlotId);
  if ((numericPlayerId === undefined || numericPlayerId <= 0) && lineupSlotId !== undefined && lineupSlotId < 0)
    return null;

  let player = resolvePlayer(pick, players);
  const playerName = asString(pick.playerName);
  if (playerName && playerId) {
    const position = asString(pick.position) ?? lineupSlotName(lineupSlotId);
    player = {
      ...(player ?? { externalId: playerId, positions: [] }),
      fullName: playerName,
      positions: player?.positions.length ? player.positions : position ? [position] : []
    };
  }

  if (!overallPick && !player) return null;

  return {
    externalId: overallPick ? `${leagueExternalId}-${season}-draft-${overallPick}` : undefined,
    round: positiveIntegerOrUndefined(pick.roundId),
    roundPick: positiveIntegerOrUndefined(pick.roundPickNumber),
    overallPick,
    teamExternalId,
    ...(player ? { player } : {}),
    keeper: asBoolean(pick.keeper),
    auctionPrice: numberOrUndefined(pick.bidAmount)
  };
}

function mapTransaction(
  input: unknown,
  players: Map<string, LeagueSagaHistoryPlayer>
): LeagueSagaHistoryTransaction | null {
  const tx = asRecord(input);
  const id = asString(tx.id) ?? asString(tx.transactionId);
  if (!id) return null;
  const items = asArray(tx.items).flatMap((item) => {
    const record = asRecord(item);
    const player = resolvePlayer(record, players);
    const fromTeamExternalId = positiveIdString(record.fromTeamId);
    const toTeamExternalId = positiveIdString(record.toTeamId);
    if (!player || (!fromTeamExternalId && !toTeamExternalId)) return [];
    return [
      {
        type: normalizeTransactionType(record.type),
        fromTeamExternalId,
        toTeamExternalId,
        player,
        notes: asString(record.type)
      }
    ];
  });
  if (!items.length) return null;
  const type = normalizeTransactionEventType(tx.type);
  return {
    externalId: id,
    type: type === 'unknown' ? (items.find((item) => item.type !== 'unknown')?.type ?? 'unknown') : type,
    occurredAt: dateFromMaybeEpoch(tx.processDate ?? tx.proposedDate ?? tx.date),
    status: asString(tx.status),
    scoringPeriodId: positiveIntegerOrUndefined(tx.scoringPeriodId),
    notes: asString(tx.type),
    items
  };
}

function mapTransactionSummary(input: unknown): LeagueSagaHistoryTeamTransactionSummary | null {
  const team = asRecord(input);
  const teamExternalId = positiveIdString(team.id) ?? positiveIdString(team.teamId);
  const counter = asRecord(team.transactionCounter);
  if (!teamExternalId || !Object.keys(counter).length) return null;
  const matchupAcquisitionTotals = Object.fromEntries(
    Object.entries(asRecord(team.matchupAcquisitionTotals)).flatMap(([period, value]) => {
      const total = nonnegativeIntegerOrUndefined(value);
      return total === undefined ? [] : [[period, total]];
    })
  );
  return {
    teamExternalId,
    trades: nonnegativeIntegerOrUndefined(counter.trades) ?? 0,
    acquisitions: nonnegativeIntegerOrUndefined(counter.acquisitions) ?? 0,
    drops: nonnegativeIntegerOrUndefined(counter.drops) ?? 0,
    acquisitionBudgetSpent: nonnegativeIntegerOrUndefined(counter.acquisitionBudgetSpent) ?? 0,
    moveToActive: nonnegativeIntegerOrUndefined(counter.moveToActive) ?? 0,
    moveToIR: nonnegativeIntegerOrUndefined(counter.moveToIR) ?? 0,
    paid: nonnegativeIntegerOrUndefined(counter.paid) ?? 0,
    teamCharges: nonnegativeIntegerOrUndefined(counter.teamCharges) ?? 0,
    misc: nonnegativeIntegerOrUndefined(counter.misc) ?? 0,
    matchupAcquisitionTotals
  };
}

function mapTradePartnerSummaries(
  transactions: LeagueSagaHistoryTransaction[]
): LeagueSagaHistoryTeamTradePartnerSummary[] {
  const pairCounts = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type !== 'trade') continue;
    const eventPairs = new Set<string>();
    for (const item of transaction.items) {
      const fromTeam = item.fromTeamExternalId;
      const toTeam = item.toTeamExternalId;
      if (!fromTeam || !toTeam || fromTeam === toTeam) continue;
      eventPairs.add([fromTeam, toTeam].sort().join('\u0000'));
    }
    for (const pair of eventPairs) pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
  }
  return [...pairCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pair, trades]) => {
      const [teamAExternalId, teamBExternalId] = pair.split('\u0000') as [string, string];
      return { teamAExternalId, teamBExternalId, trades };
    });
}

function normalizeTransactionType(
  input: unknown
): 'add' | 'drop' | 'trade' | 'draft' | 'waiver' | 'free_agent' | 'unknown' {
  const value = String(input ?? '').toLowerCase();
  if (value.includes('trade')) return 'trade';
  if (value.includes('drop')) return 'drop';
  if (value.includes('add')) return 'add';
  if (value.includes('waiver')) return 'waiver';
  if (value.includes('free')) return 'free_agent';
  if (value.includes('draft')) return 'draft';
  return 'unknown';
}

function normalizeTransactionEventType(
  input: unknown
): 'add' | 'drop' | 'trade' | 'draft' | 'waiver' | 'free_agent' | 'unknown' {
  const value = String(input ?? '').toLowerCase();
  if (value.includes('trade')) return 'trade';
  if (value.includes('waiver')) return 'waiver';
  if (value.includes('free')) return 'free_agent';
  return normalizeTransactionType(input);
}

function normalizeTransactionRows(input: unknown[]): unknown[] {
  const rows = input.map(asRecord).filter((row) => Object.keys(row).length > 0);
  const proposals = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (asString(row.type)?.toUpperCase() !== 'TRADE_PROPOSAL') continue;
    const id = asString(row.id) ?? asString(row.transactionId);
    if (id) proposals.set(id, row);
  }

  const normalized = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const sourceType = asString(row.type)?.toUpperCase() ?? '';
    if (sourceType === 'TRADE_PROPOSAL') continue;

    const relatedId = asString(row.relatedTransactionId);
    const sourceId = asString(row.id) ?? asString(row.transactionId);
    const id = sourceType === 'TRADE_ACCEPT' || sourceType === 'TRADE_UPHOLD' ? (relatedId ?? sourceId) : sourceId;
    if (!id) continue;

    const proposal = relatedId ? proposals.get(relatedId) : undefined;
    const items = asArray(row.items).length ? asArray(row.items) : asArray(proposal?.items);
    const transaction = {
      ...proposal,
      ...row,
      id,
      ...(sourceType === 'TRADE_ACCEPT' || sourceType === 'TRADE_UPHOLD' ? { type: 'TRADE' } : {}),
      items
    };
    const existing = normalized.get(id);
    if (!existing || asArray(transaction.items).length > asArray(existing.items).length)
      normalized.set(id, transaction);
  }
  return [...normalized.values()];
}

function buildPlayerLookup(
  players: unknown[],
  rosterEntries: LeagueSagaHistoryRosterEntry[]
): Map<string, LeagueSagaHistoryPlayer> {
  const result = new Map<string, LeagueSagaHistoryPlayer>();
  for (const input of players) {
    const player = mapPlayer(input);
    if (player) result.set(player.externalId, player);
  }
  for (const entry of rosterEntries) result.set(entry.player.externalId, entry.player);
  return result;
}

function mapTransactionCoverage(
  data: Record<string, unknown>,
  season: number,
  unresolvedPlayerNames: number
): LeagueSagaHistoryTransactionCoverage {
  const metadata = asRecord(data[ESPN_IMPORT_METADATA_KEY]);
  const requested = nonnegativeIntegerOrUndefined(metadata.transactionPeriodsRequested) ?? 0;
  const supported = nonnegativeIntegerOrUndefined(metadata.transactionPeriodsSupported) ?? 0;
  const available = asBoolean(metadata.transactionHistoryAvailable) ?? (season >= 2018 && supported > 0);
  const limitations: string[] = [];
  if (!available && season < 2018)
    limitations.push('ESPN player-level transaction history is unavailable before 2018.');
  else if (requested > supported)
    limitations.push(`ESPN returned transaction data for ${supported} of ${requested} scoring periods.`);
  if (unresolvedPlayerNames)
    limitations.push(`${unresolvedPlayerNames} transaction player names could not be resolved from ESPN.`);

  return {
    available,
    detailLevel: available ? 'player' : 'unavailable',
    periodsRequested: requested,
    periodsSupported: supported,
    limitations
  };
}

function playerCandidates(input: unknown): Record<string, unknown>[] {
  const record = asRecord(input);
  const pool = asRecord(record.playerPoolEntry);
  return [asRecord(pool.player), asRecord(record.player), record, pool].filter(
    (candidate) => Object.keys(candidate).length > 0
  );
}

function firstString(candidates: Record<string, unknown>[], key: string): string | undefined {
  for (const candidate of candidates) {
    const value = asString(candidate[key]);
    if (value) return value;
  }
  return undefined;
}

function teamLogo(team: Record<string, unknown>): string | undefined {
  const direct = [team.logo, team.logoUrl, team.logoURL, team.teamLogo].map(asString).find(Boolean);
  if (direct) return direct;
  for (const input of asArray(team.logos)) {
    const logo = asRecord(input);
    const value = asString(logo.href) ?? asString(logo.url);
    if (value) return value;
  }
  return undefined;
}

function resolvePlayer(input: unknown, players: Map<string, LeagueSagaHistoryPlayer>): LeagueSagaHistoryPlayer | null {
  const direct = mapPlayer(input);
  if (!direct) return null;
  const known = players.get(direct.externalId);
  if (!known) return direct;
  if (direct.fullName.startsWith('ESPN Player ')) return known;
  return {
    ...known,
    ...direct,
    positions: direct.positions.length ? direct.positions : known.positions
  };
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function asArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function asString(input: unknown): string | undefined {
  if (typeof input === 'string' && input.trim()) return input;
  if (typeof input === 'number' && Number.isFinite(input)) return String(input);
  return undefined;
}

function asBoolean(input: unknown): boolean | undefined {
  if (typeof input === 'boolean') return input;
  return undefined;
}

function buildMemberNameMap(members: unknown[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const input of members) {
    const member = asRecord(input);
    const id = asString(member.id);
    const name =
      asString(member.displayName) ??
      [asString(member.firstName), asString(member.lastName)].filter(Boolean).join(' ').trim();
    if (id && name) result.set(id, name);
  }
  return result;
}

function positiveIdString(input: unknown): string | undefined {
  const value = numberOrUndefined(input);
  return value !== undefined && value > 0 ? String(value) : undefined;
}

const LINEUP_SLOT_NAMES: Record<number, string> = {
  0: 'QB',
  1: 'TQB',
  2: 'RB',
  3: 'RB/WR',
  4: 'WR',
  5: 'WR/TE',
  6: 'TE',
  7: 'OP',
  8: 'DT',
  9: 'DE',
  10: 'LB',
  11: 'DL',
  12: 'CB',
  13: 'S',
  14: 'DB',
  15: 'DP',
  16: 'D/ST',
  17: 'K',
  18: 'P',
  19: 'HC',
  20: 'Bench',
  21: 'IR',
  22: 'Unknown',
  23: 'FLEX',
  24: 'OP'
};

const POSITION_NAMES: Record<number, string> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'D/ST'
};

const PUBLIC_POSITION_NAMES: Record<string, string> = {
  quarterback: 'QB',
  'running back': 'RB',
  'wide receiver': 'WR',
  'tight end': 'TE',
  kicker: 'K',
  defense: 'D/ST',
  'defense/special teams': 'D/ST',
  dst: 'D/ST'
};

function lineupSlotName(input: unknown): string | undefined {
  const id = numberOrUndefined(input);
  return id === undefined ? undefined : (LINEUP_SLOT_NAMES[id] ?? String(id));
}

function playerPositions(player: Record<string, unknown>): string[] {
  const primary = numberOrUndefined(player.defaultPositionId);
  if (primary !== undefined) return [POSITION_NAMES[primary] ?? String(primary)];
  const publicPosition = asRecord(player.position);
  const publicPositionName = asString(publicPosition.abbreviation) ?? asString(publicPosition.displayName);
  if (publicPositionName) {
    const normalized = PUBLIC_POSITION_NAMES[publicPositionName.toLowerCase()] ?? publicPositionName;
    return [normalized];
  }
  return asArray(player.eligibleSlots)
    .map((slot) => numberOrUndefined(slot))
    .filter((slot): slot is number => slot !== undefined && POSITION_NAMES[slot] !== undefined)
    .map((slot) => POSITION_NAMES[slot]);
}

function numberOrUndefined(input: unknown): number | undefined {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim() && Number.isFinite(Number(input))) return Number(input);
  return undefined;
}

function positiveIntegerOrUndefined(input: unknown): number | undefined {
  const value = numberOrUndefined(input);
  return value && Number.isInteger(value) && value > 0 ? value : undefined;
}

function nonnegativeIntegerOrUndefined(input: unknown): number | undefined {
  const value = numberOrUndefined(input);
  return value !== undefined && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function dateFromMaybeEpoch(input: unknown): string | undefined {
  const value = numberOrUndefined(input);
  if (!value) return undefined;
  const ms = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function maybeUrl(input: string | undefined): string | undefined {
  if (!input) return undefined;
  try {
    return new URL(input).toString();
  } catch {
    return undefined;
  }
}

function normalizeLeagueSettings(input: Record<string, unknown>): NormalizedLeagueSettings {
  const scheduleSettings = asRecord(input.scheduleSettings);
  const rosterSettings = asRecord(input.rosterSettings);
  const scoringSettings = asRecord(input.scoringSettings);
  const schedule = compactRecord({
    regularSeasonMatchupPeriods: positiveIntegerOrUndefined(scheduleSettings.matchupPeriodCount),
    playoffTeamCount: positiveIntegerOrUndefined(scheduleSettings.playoffTeamCount),
    finalScoringPeriod: positiveIntegerOrUndefined(scheduleSettings.finalScoringPeriod)
  });
  const slots = Object.entries(asRecord(rosterSettings.lineupSlotCounts))
    .flatMap(([sourceId, rawCount]) => {
      const count = positiveIntegerOrUndefined(rawCount);
      if (count === undefined) return [];
      const slotId = numberOrUndefined(sourceId);
      return [{ sourceId, name: slotId === undefined ? `Slot ${sourceId}` : lineupSlotName(slotId)!, count }];
    })
    .sort((left, right) => Number(left.sourceId) - Number(right.sourceId));
  const rules = normalizeScoringRules(scoringSettings);
  const pointsPerReception = rules.find(
    (rule) => rule.sourceId === '53' || rule.name?.toLowerCase() === 'receptions'
  )?.points;
  const scoring = compactRecord({
    mode: asString(scoringSettings.scoringType),
    format: scoringFormat(pointsPerReception),
    pointsPerReception,
    rules: rules.length ? rules : undefined
  });

  return {
    ...(Object.keys(schedule).length ? { schedule } : {}),
    ...(slots.length ? { roster: { slots } } : {}),
    ...(Object.keys(scoring).length ? { scoring: { ...scoring, rules: rules.length ? rules : [] } } : {})
  };
}

function normalizeScoringRules(scoringSettings: Record<string, unknown>) {
  const byId = new Map<
    string,
    {
      sourceId: string;
      name?: string;
      abbreviation?: string;
      points: number;
      pointOverrides?: Record<string, number>;
    }
  >();
  const rawStats = asRecord(scoringSettings.statSettings).stats;
  if (Array.isArray(rawStats)) {
    for (const [index, input] of rawStats.entries()) {
      const record = asRecord(input);
      const fallbackId = asString(record.id) ?? asString(record.statId) ?? String(index);
      addScoringRule(byId, record, fallbackId);
    }
  } else {
    for (const [fallbackId, input] of Object.entries(asRecord(rawStats))) {
      addScoringRule(byId, input, fallbackId);
    }
  }
  for (const input of asArray(scoringSettings.scoringItems)) {
    const record = asRecord(input);
    const sourceId = asString(record.statId) ?? asString(record.id);
    if (sourceId) addScoringRule(byId, record, sourceId);
  }
  return [...byId.values()].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId, undefined, { numeric: true })
  );
}

function addScoringRule(
  target: Map<
    string,
    {
      sourceId: string;
      name?: string;
      abbreviation?: string;
      points: number;
      pointOverrides?: Record<string, number>;
    }
  >,
  input: unknown,
  fallbackId: string
): void {
  const rule = asRecord(input);
  const sourceId = asString(rule.id) ?? fallbackId;
  const directPoints = numberOrUndefined(rule.points);
  const pointOverrides = Object.fromEntries(
    Object.entries(asRecord(rule.pointsOverrides))
      .flatMap(([overrideId, value]) => {
        const overridePoints = numberOrUndefined(value);
        return overridePoints === undefined ? [] : [[overrideId, overridePoints] as const];
      })
      .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
  );
  const overridePoints = Object.values(pointOverrides);
  const points =
    directPoints ??
    (overridePoints.length
      ? overridePoints.reduce((best, value) => (Math.abs(value) > Math.abs(best) ? value : best))
      : undefined);
  if (points === undefined) return;
  const next = {
    sourceId,
    ...(asString(rule.name) ? { name: asString(rule.name) } : {}),
    ...(asString(rule.abbrev) ? { abbreviation: asString(rule.abbrev) } : {}),
    points,
    ...(overridePoints.length ? { pointOverrides } : {})
  };
  const existing = target.get(sourceId);
  if (!existing) {
    target.set(sourceId, next);
    return;
  }
  const mergedOverrides = { ...existing.pointOverrides, ...next.pointOverrides };
  target.set(sourceId, {
    sourceId,
    name: next.name ?? existing.name,
    abbreviation: next.abbreviation ?? existing.abbreviation,
    points: Math.abs(next.points) > Math.abs(existing.points) ? next.points : existing.points,
    ...(Object.keys(mergedOverrides).length ? { pointOverrides: mergedOverrides } : {})
  });
}

function scoringFormat(pointsPerReception: number | undefined): 'standard' | 'half_ppr' | 'ppr' | 'custom' | undefined {
  if (pointsPerReception === undefined) return undefined;
  if (Math.abs(pointsPerReception) < 0.01) return 'standard';
  if (Math.abs(pointsPerReception - 0.5) < 0.01) return 'half_ppr';
  if (Math.abs(pointsPerReception - 1) < 0.01) return 'ppr';
  return 'custom';
}

function compactRecord<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}
