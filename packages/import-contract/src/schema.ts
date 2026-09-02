import { z } from 'zod';
import { IMPORT_CONTRACT_VERSION } from './version.js';

export const ImportProviderSchema = z.enum(['espn', 'yahoo', 'sleeper', 'mock']);

export const MatchupTeamScoreSchema = z.object({
  teamExternalId: z.string().min(1),
  score: z.number().optional(),
  projectedScore: z.number().optional(),
  winner: z.boolean().optional()
});

export const NormalizedScheduleSettingsSchema = z.object({
  regularSeasonMatchupPeriods: z.number().int().positive().optional(),
  playoffTeamCount: z.number().int().positive().optional(),
  finalScoringPeriod: z.number().int().positive().optional()
});

export const NormalizedRosterSlotSchema = z.object({
  sourceId: z.string().min(1),
  name: z.string().min(1),
  count: z.number().int().positive()
});

export const NormalizedRosterSettingsSchema = z.object({
  slots: z.array(NormalizedRosterSlotSchema)
});

export const NormalizedScoringRuleSchema = z.object({
  sourceId: z.string().min(1),
  name: z.string().min(1).optional(),
  abbreviation: z.string().min(1).optional(),
  points: z.number(),
  pointOverrides: z.record(z.string(), z.number()).optional()
});

export const NormalizedScoringSettingsSchema = z.object({
  mode: z.string().min(1).optional(),
  format: z.enum(['standard', 'half_ppr', 'ppr', 'custom', 'unknown']).optional(),
  pointsPerReception: z.number().optional(),
  rules: z.array(NormalizedScoringRuleSchema)
});

export const NormalizedLeagueSettingsSchema = z.object({
  schedule: NormalizedScheduleSettingsSchema.optional(),
  roster: NormalizedRosterSettingsSchema.optional(),
  scoring: NormalizedScoringSettingsSchema.optional()
});

export const HistoryLeagueSchema = z.object({
  name: z.string().min(1),
  scoringPeriodId: z.number().int().nonnegative().optional(),
  size: z.number().int().positive().optional(),
  visibility: z.enum(['public', 'private', 'unknown']).default('unknown'),
  settings: NormalizedLeagueSettingsSchema.optional()
});

export const HistoryTeamSchema = z.object({
  externalId: z.string().min(1),
  abbreviation: z.string().optional(),
  location: z.string().optional(),
  nickname: z.string().optional(),
  displayName: z.string().min(1),
  ownerDisplayNames: z.array(z.string()).default([]),
  logoUrl: z.string().url().optional(),
  playoffSeed: z.number().int().positive().optional(),
  finalStanding: z.number().int().positive().optional()
});

export const HistoryPlayerSchema = z.object({
  externalId: z.string().min(1),
  fullName: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  proTeam: z.string().optional(),
  positions: z.array(z.string()).default([]),
  jersey: z.string().optional(),
  status: z.string().optional()
});

export const HistoryRosterEntrySchema = z.object({
  teamExternalId: z.string().min(1),
  player: HistoryPlayerSchema,
  lineupSlot: z.string().optional(),
  acquisitionType: z.string().optional(),
  acquisitionDate: z.string().datetime().optional(),
  injuryStatus: z.string().optional()
});

export const HistoryMatchupSchema = z.object({
  externalId: z.string().min(1),
  scoringPeriodId: z.number().int().positive(),
  home: MatchupTeamScoreSchema.optional(),
  away: MatchupTeamScoreSchema.optional(),
  winnerTeamExternalId: z.string().optional(),
  playoffTierType: z.string().optional()
});

export const HistoryDraftPickSchema = z.object({
  externalId: z.string().min(1).optional(),
  round: z.number().int().positive().optional(),
  roundPick: z.number().int().positive().optional(),
  overallPick: z.number().int().positive().optional(),
  teamExternalId: z.string().min(1).optional(),
  player: HistoryPlayerSchema.optional(),
  keeper: z.boolean().optional(),
  auctionPrice: z.number().optional()
});

export const HistoryTransactionItemSchema = z.object({
  type: z.enum(['add', 'drop', 'trade', 'draft', 'waiver', 'free_agent', 'unknown']),
  teamExternalId: z.string().optional(),
  player: HistoryPlayerSchema.optional(),
  notes: z.string().optional()
});

export const HistoryTransactionSchema = z.object({
  externalId: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
  status: z.string().optional(),
  items: z.array(HistoryTransactionItemSchema).default([]),
  notes: z.string().optional()
});

export const LeagueSagaHistorySeasonSchema = z
  .object({
    season: z.number().int().min(2000).max(2100),
    league: HistoryLeagueSchema,
    teams: z.array(HistoryTeamSchema).min(1, 'History season must contain at least one team.'),
    rosterEntries: z.array(HistoryRosterEntrySchema).default([]),
    matchups: z.array(HistoryMatchupSchema).default([]),
    draftPicks: z.array(HistoryDraftPickSchema).default([]),
    transactions: z.array(HistoryTransactionSchema).default([]),
    warnings: z.array(z.string()).default([])
  })
  .superRefine((season, ctx) => {
    const teamIds = new Set<string>();
    const matchupIds = new Set<string>();
    const transactionIds = new Set<string>();

    function issue(message: string, path: Array<string | number>) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
    }

    for (const [index, team] of season.teams.entries()) {
      if (teamIds.has(team.externalId)) issue(`Duplicate team external ID ${team.externalId}.`, ['teams', index]);
      else teamIds.add(team.externalId);
    }
    for (const [index, entry] of season.rosterEntries.entries()) {
      if (!teamIds.has(entry.teamExternalId)) {
        issue(`Roster entry references unknown team ${entry.teamExternalId}.`, ['rosterEntries', index]);
      }
    }
    for (const [index, matchup] of season.matchups.entries()) {
      if (matchupIds.has(matchup.externalId)) {
        issue(`Duplicate matchup external ID ${matchup.externalId}.`, ['matchups', index]);
      } else matchupIds.add(matchup.externalId);
      const sideTeamIds = [matchup.home?.teamExternalId, matchup.away?.teamExternalId].filter(
        (value): value is string => Boolean(value)
      );
      for (const teamId of sideTeamIds) {
        if (!teamIds.has(teamId)) issue(`Matchup references unknown team ${teamId}.`, ['matchups', index]);
      }
      if (matchup.winnerTeamExternalId && !sideTeamIds.includes(matchup.winnerTeamExternalId)) {
        issue(`Matchup winner ${matchup.winnerTeamExternalId} is not a participant.`, [
          'matchups',
          index,
          'winnerTeamExternalId'
        ]);
      }
    }
    for (const [index, pick] of season.draftPicks.entries()) {
      if (pick.teamExternalId && !teamIds.has(pick.teamExternalId)) {
        issue(`Draft pick references unknown team ${pick.teamExternalId}.`, ['draftPicks', index]);
      }
    }
    for (const [index, transaction] of season.transactions.entries()) {
      if (transactionIds.has(transaction.externalId)) {
        issue(`Duplicate transaction external ID ${transaction.externalId}.`, ['transactions', index]);
      } else transactionIds.add(transaction.externalId);
      for (const [itemIndex, item] of transaction.items.entries()) {
        if (item.teamExternalId && !teamIds.has(item.teamExternalId)) {
          issue(`Transaction item references unknown team ${item.teamExternalId}.`, [
            'transactions',
            index,
            'items',
            itemIndex,
            'teamExternalId'
          ]);
        }
      }
    }
  });

export const LeagueSagaHistoryImportSchema = z
  .object({
    kind: z.literal('league-history'),
    contractVersion: z.literal(IMPORT_CONTRACT_VERSION),
    provider: ImportProviderSchema,
    generatedAt: z.string().datetime(),
    helper: z.object({
      name: z.string().min(1),
      version: z.string().min(1),
      platform: z.string().min(1)
    }),
    importSessionId: z.string().min(1).optional(),
    leagueExternalId: z.string().min(1),
    leagueName: z.string().min(1),
    startSeason: z.number().int().min(2000).max(2100),
    endSeason: z.number().int().min(2000).max(2100),
    seasons: z.array(LeagueSagaHistorySeasonSchema).min(1, 'History import must contain at least one season.'),
    warnings: z.array(z.string()).default([])
  })
  .superRefine((history, ctx) => {
    const seasonYears = history.seasons.map((season) => season.season);
    const uniqueSeasonYears = new Set(seasonYears);

    function issue(message: string, path: Array<string | number>) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
    }

    if (uniqueSeasonYears.size !== seasonYears.length) {
      issue('History import contains duplicate seasons.', ['seasons']);
    }
    if (seasonYears.some((season, index) => index > 0 && season <= seasonYears[index - 1]!)) {
      issue('History import seasons must be ordered from oldest to newest.', ['seasons']);
    }
    if (history.startSeason !== seasonYears[0]) {
      issue('History import startSeason must match its oldest season.', ['startSeason']);
    }
    if (history.endSeason !== seasonYears.at(-1)) {
      issue('History import endSeason must match its newest season.', ['endSeason']);
    }
  });

export const LeagueSagaImportPreviewSchema = z.object({
  importSessionId: z.string().min(1),
  contractVersion: z.literal(IMPORT_CONTRACT_VERSION),
  leagueName: z.string().min(1),
  season: z.number().int(),
  counts: z.object({
    teams: z.number().int().nonnegative(),
    rosterEntries: z.number().int().nonnegative(),
    matchups: z.number().int().nonnegative(),
    draftPicks: z.number().int().nonnegative(),
    transactions: z.number().int().nonnegative()
  }),
  warnings: z.array(z.string()).default([])
});

export type ImportProvider = z.infer<typeof ImportProviderSchema>;
export type NormalizedLeagueSettings = z.infer<typeof NormalizedLeagueSettingsSchema>;
export type LeagueSagaHistorySeason = z.infer<typeof LeagueSagaHistorySeasonSchema>;
export type LeagueSagaHistoryImport = z.infer<typeof LeagueSagaHistoryImportSchema>;
export type LeagueSagaImportPreview = z.infer<typeof LeagueSagaImportPreviewSchema>;
export type LeagueSagaHistoryTeam = z.infer<typeof HistoryTeamSchema>;
export type LeagueSagaHistoryPlayer = z.infer<typeof HistoryPlayerSchema>;
export type LeagueSagaHistoryRosterEntry = z.infer<typeof HistoryRosterEntrySchema>;
export type LeagueSagaHistoryMatchup = z.infer<typeof HistoryMatchupSchema>;
export type LeagueSagaHistoryDraftPick = z.infer<typeof HistoryDraftPickSchema>;
export type LeagueSagaHistoryTransaction = z.infer<typeof HistoryTransactionSchema>;
