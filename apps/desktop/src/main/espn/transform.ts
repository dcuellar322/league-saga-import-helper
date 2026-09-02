import {
  validateHistorySeason,
  type LeagueSagaHistoryDraftPick,
  type LeagueSagaHistoryMatchup,
  type LeagueSagaHistoryPlayer,
  type LeagueSagaHistoryRosterEntry,
  type LeagueSagaHistorySeason,
  type LeagueSagaHistoryTeam,
  type LeagueSagaHistoryTransaction,
  type NormalizedLeagueSettings
} from '@leaguesaga/import-contract';

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
  const transactionsRaw = asArray(data.transactions);
  const memberNames = buildMemberNameMap(asArray(data.members));

  const teams = teamsRaw.map((team) => mapTeam(team, memberNames)).filter(Boolean) as LeagueSagaHistoryTeam[];
  const rosterEntries = teamsRaw.flatMap((team) => mapRosterEntries(team));
  const playerLookup = new Map(rosterEntries.map((entry) => [entry.player.externalId, entry.player]));
  const matchups = scheduleRaw
    .map((matchup) => mapMatchup(matchup, context.season))
    .filter(Boolean) as LeagueSagaHistoryMatchup[];
  const draftPicks = asArray(draftDetail.picks)
    .map((pick) => mapDraftPick(pick, leagueExternalId, context.season, playerLookup))
    .filter(Boolean) as LeagueSagaHistoryDraftPick[];
  const transactions = transactionsRaw
    .map((transaction) => mapTransaction(transaction, playerLookup))
    .filter(Boolean) as LeagueSagaHistoryTransaction[];

  if (!teams.length) {
    throw new Error('ESPN returned no teams. Check the league ID, season, and account access, then try again.');
  }

  const warnings: string[] = [];
  if (!rosterEntries.length)
    warnings.push(
      'No roster entries were found. ESPN may have returned limited data or the season may be unavailable.'
    );
  const unresolvedPlayers = [
    ...draftPicks.flatMap((pick) => (pick.player ? [pick.player] : [])),
    ...transactions.flatMap((transaction) => transaction.items.flatMap((item) => (item.player ? [item.player] : [])))
  ].filter((player) => player.fullName.startsWith('ESPN Player ')).length;
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
  const owners = asArray(team.owners).map((owner) => memberNames.get(String(owner)) ?? String(owner));

  return {
    externalId: id,
    abbreviation: asString(team.abbrev),
    location,
    nickname,
    displayName,
    ownerDisplayNames: owners,
    logoUrl: maybeUrl(asString(team.logo)),
    playoffSeed: positiveIntegerOrUndefined(team.playoffSeed),
    finalStanding: positiveIntegerOrUndefined(team.finalStanding)
  };
}

function mapRosterEntries(input: unknown): LeagueSagaHistoryRosterEntry[] {
  const team = asRecord(input);
  const teamId = asString(team.id) ?? asString(team.teamId);
  if (!teamId) return [];

  return asArray(asRecord(team.roster).entries).flatMap((entry) => {
    const record = asRecord(entry);
    const playerPoolEntry = asRecord(record.playerPoolEntry);
    const player = mapPlayer(playerPoolEntry.player ?? record.player);
    if (!player) return [];
    return [
      {
        teamExternalId: teamId,
        player,
        lineupSlot: lineupSlotName(record.lineupSlotId),
        acquisitionType: asString(record.acquisitionType),
        acquisitionDate: dateFromMaybeEpoch(record.acquisitionDate),
        injuryStatus: asString(playerPoolEntry.injuryStatus)
      }
    ];
  });
}

function mapPlayer(input: unknown): LeagueSagaHistoryPlayer | null {
  const player = asRecord(input);
  const id = asString(player.id) ?? asString(player.playerId);
  if (!id) return null;

  const fallbackName = [asString(player.firstName), asString(player.lastName)].filter(Boolean).join(' ').trim();
  const fullName = asString(player.fullName) ?? (fallbackName || `Player ${id}`);

  return {
    externalId: id,
    fullName,
    firstName: asString(player.firstName),
    lastName: asString(player.lastName),
    proTeam: asString(player.proTeamAbbrev) ?? asString(player.proTeamId),
    positions: playerPositions(player),
    jersey: asString(player.jersey),
    status: asString(player.injuryStatus) ?? asString(player.status)
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
  const winnerTeamExternalId = home?.winner ? home.teamExternalId : away?.winner ? away.teamExternalId : undefined;

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
  const player =
    mapPlayer(pick.playerPoolEntry ? asRecord(pick.playerPoolEntry).player : pick.player) ??
    playerFromId(pick.playerId, players);

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
  return {
    externalId: id,
    occurredAt: dateFromMaybeEpoch(tx.proposedDate ?? tx.processDate ?? tx.date),
    status: asString(tx.status),
    notes: asString(tx.type),
    items: asArray(tx.items).map((item) => {
      const record = asRecord(item);
      const player = mapPlayer(record.player) ?? playerFromId(record.playerId, players);
      return {
        type: normalizeTransactionType(record.type),
        teamExternalId: positiveIdString(record.toTeamId) ?? positiveIdString(record.fromTeamId),
        ...(player ? { player } : {}),
        notes: asString(record.type)
      };
    })
  };
}

function normalizeTransactionType(
  input: unknown
): 'add' | 'drop' | 'trade' | 'draft' | 'waiver' | 'free_agent' | 'unknown' {
  const value = String(input ?? '').toLowerCase();
  if (value.includes('add')) return 'add';
  if (value.includes('drop')) return 'drop';
  if (value.includes('trade')) return 'trade';
  if (value.includes('draft')) return 'draft';
  if (value.includes('waiver')) return 'waiver';
  if (value.includes('free')) return 'free_agent';
  return 'unknown';
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

function playerFromId(input: unknown, players: Map<string, LeagueSagaHistoryPlayer>): LeagueSagaHistoryPlayer | null {
  const id = asString(input);
  return id
    ? (players.get(id) ?? {
        externalId: id,
        fullName: `ESPN Player ${id}`,
        positions: []
      })
    : null;
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

function lineupSlotName(input: unknown): string | undefined {
  const id = numberOrUndefined(input);
  return id === undefined ? undefined : (LINEUP_SLOT_NAMES[id] ?? String(id));
}

function playerPositions(player: Record<string, unknown>): string[] {
  const primary = numberOrUndefined(player.defaultPositionId);
  if (primary !== undefined) return [POSITION_NAMES[primary] ?? String(primary)];
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

export function normalizeLeagueSettings(input: Record<string, unknown>): NormalizedLeagueSettings {
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
