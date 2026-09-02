import {
  IMPORT_CONTRACT_VERSION,
  validateImportBundle,
  type LeagueSagaImportBundle,
  type LeagueSagaDraftPick,
  type LeagueSagaImportPlayer,
  type LeagueSagaImportTeam,
  type LeagueSagaMatchup,
  type LeagueSagaRosterEntry,
  type LeagueSagaTransaction
} from '@leaguesaga/import-contract';

export type TransformContext = {
  leagueId: string;
  season: number;
  importSessionId?: string;
  helperVersion: string;
  platform: string;
};

export function transformEspnPayload(payload: unknown, context: TransformContext): LeagueSagaImportBundle {
  const data = asRecord(payload);
  const leagueExternalId = String(data.id ?? context.leagueId);
  const settings = asRecord(data.settings);
  const leagueName = asString(settings.name) ?? asString(data.name) ?? `ESPN League ${leagueExternalId}`;
  const teamsRaw = asArray(data.teams);
  const scheduleRaw = asArray(data.schedule);
  const draftDetail = asRecord(data.draftDetail);
  const transactionsRaw = asArray(data.transactions);
  const memberNames = buildMemberNameMap(asArray(data.members));

  const teams = teamsRaw
    .map((team) => mapTeam(team, leagueExternalId, memberNames))
    .filter(Boolean) as LeagueSagaImportTeam[];
  const rosterEntries = teamsRaw.flatMap((team) => mapRosterEntries(team));
  const playerLookup = new Map(rosterEntries.map((entry) => [entry.player.externalRef.externalId, entry.player]));
  const matchups = scheduleRaw
    .map((matchup) => mapMatchup(matchup, leagueExternalId, context.season))
    .filter(Boolean) as LeagueSagaMatchup[];
  const draftPicks = asArray(draftDetail.picks)
    .map((pick) => mapDraftPick(pick, leagueExternalId, context.season, playerLookup))
    .filter(Boolean) as LeagueSagaDraftPick[];
  const transactions = transactionsRaw
    .map((transaction) => mapTransaction(transaction, leagueExternalId, context.season, playerLookup))
    .filter(Boolean) as LeagueSagaTransaction[];

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

  const bundle: LeagueSagaImportBundle = {
    metadata: {
      contractVersion: IMPORT_CONTRACT_VERSION,
      source: 'espn',
      generatedAt: new Date().toISOString(),
      importSessionId: context.importSessionId,
      helper: {
        name: 'LeagueSaga Import Helper',
        version: context.helperVersion,
        platform: context.platform
      },
      warnings
    },
    league: {
      externalRef: {
        provider: 'espn',
        externalId: leagueExternalId,
        url: `https://fantasy.espn.com/football/league?leagueId=${encodeURIComponent(leagueExternalId)}&seasonId=${context.season}`
      },
      name: leagueName,
      season: context.season,
      size: teams.length,
      scoringPeriodId: numberOrUndefined(data.scoringPeriodId),
      scoringType: asString(settings.scoringSettings && asRecord(settings.scoringSettings).scoringType),
      visibility:
        asBoolean(settings.isPublic) === true
          ? 'public'
          : asBoolean(settings.isPublic) === false
            ? 'private'
            : 'unknown',
      settings: scrubUnknown(settings)
    },
    teams,
    rosterEntries,
    matchups,
    draftPicks,
    transactions
  };

  return validateImportBundle(bundle);
}

function mapTeam(
  input: unknown,
  leagueExternalId: string,
  memberNames: Map<string, string>
): LeagueSagaImportTeam | null {
  const team = asRecord(input);
  const id = asString(team.id) ?? asString(team.teamId);
  if (!id) return null;

  const location = asString(team.location);
  const nickname = asString(team.nickname);
  const displayName = [location, nickname].filter(Boolean).join(' ').trim() || asString(team.name) || `Team ${id}`;
  const owners = asArray(team.owners).map((owner) => memberNames.get(String(owner)) ?? String(owner));

  return {
    externalRef: { provider: 'espn', externalId: id, rawKind: 'team' },
    leagueExternalId,
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

function mapRosterEntries(input: unknown): LeagueSagaRosterEntry[] {
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

function mapPlayer(input: unknown): LeagueSagaImportPlayer | null {
  const player = asRecord(input);
  const id = asString(player.id) ?? asString(player.playerId);
  if (!id) return null;

  const fallbackName = [asString(player.firstName), asString(player.lastName)].filter(Boolean).join(' ').trim();
  const fullName = asString(player.fullName) ?? (fallbackName || `Player ${id}`);

  return {
    externalRef: { provider: 'espn', externalId: id, rawKind: 'player' },
    fullName,
    firstName: asString(player.firstName),
    lastName: asString(player.lastName),
    proTeam: asString(player.proTeamAbbrev) ?? asString(player.proTeamId),
    positions: playerPositions(player),
    jersey: asString(player.jersey),
    status: asString(player.injuryStatus) ?? asString(player.status)
  };
}

function mapMatchup(input: unknown, leagueExternalId: string, season: number): LeagueSagaMatchup | null {
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
    externalRef: { provider: 'espn', externalId: id, rawKind: 'matchup' },
    leagueExternalId,
    season,
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
  players: Map<string, LeagueSagaImportPlayer>
): LeagueSagaDraftPick | null {
  const pick = asRecord(input);
  const overallPick = positiveIntegerOrUndefined(pick.overallPickNumber) ?? positiveIntegerOrUndefined(pick.pickNumber);
  const teamExternalId = positiveIdString(pick.teamId);
  const player =
    mapPlayer(pick.playerPoolEntry ? asRecord(pick.playerPoolEntry).player : pick.player) ??
    playerFromId(pick.playerId, players);

  if (!overallPick && !player) return null;

  return {
    externalRef: overallPick
      ? { provider: 'espn', externalId: `${leagueExternalId}-${season}-draft-${overallPick}`, rawKind: 'draftPick' }
      : undefined,
    leagueExternalId,
    season,
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
  leagueExternalId: string,
  season: number,
  players: Map<string, LeagueSagaImportPlayer>
): LeagueSagaTransaction | null {
  const tx = asRecord(input);
  const id = asString(tx.id) ?? asString(tx.transactionId);
  if (!id) return null;
  return {
    externalRef: { provider: 'espn', externalId: id, rawKind: 'transaction' },
    leagueExternalId,
    season,
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

function playerFromId(input: unknown, players: Map<string, LeagueSagaImportPlayer>): LeagueSagaImportPlayer | null {
  const id = asString(input);
  return id
    ? (players.get(id) ?? {
        externalRef: { provider: 'espn', externalId: id, rawKind: 'player' },
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
  2: 'RB',
  4: 'WR',
  6: 'TE',
  16: 'D/ST',
  17: 'K',
  20: 'Bench',
  21: 'IR',
  23: 'FLEX'
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

function scrubUnknown(input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = key.toLowerCase();
    if (
      ['cookie', 'token', 'secret', 'password', 'authorization'].some((sensitive) => normalizedKey.includes(sensitive))
    )
      continue;
    if (value === undefined || typeof value === 'function') continue;
    if (Array.isArray(value)) result[key] = value.map((item) => scrubValue(item));
    else result[key] = scrubValue(value);
  }
  return result;
}

function scrubValue(value: unknown): unknown {
  return value && typeof value === 'object' && !Array.isArray(value) ? scrubUnknown(asRecord(value)) : value;
}
