import { z } from 'zod';
import { IMPORT_CONTRACT_VERSION } from './version.js';

export const ImportProviderSchema = z.enum(['espn', 'mock']);

export const ExternalRefSchema = z.object({
  provider: ImportProviderSchema,
  externalId: z.string().min(1),
  url: z.string().url().optional(),
  rawKind: z.string().optional()
});

export const ImportMetadataSchema = z.object({
  contractVersion: z.literal(IMPORT_CONTRACT_VERSION),
  source: ImportProviderSchema,
  generatedAt: z.string().datetime(),
  helper: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    platform: z.string().min(1)
  }),
  importSessionId: z.string().min(1).optional(),
  warnings: z.array(z.string()).default([])
});

export const LeagueSchema = z.object({
  externalRef: ExternalRefSchema,
  name: z.string().min(1),
  season: z.number().int().min(2000).max(2100),
  scoringPeriodId: z.number().int().nonnegative().optional(),
  size: z.number().int().positive().optional(),
  scoringType: z.string().optional(),
  visibility: z.enum(['public', 'private', 'unknown']).default('unknown'),
  settings: z.record(z.string(), z.unknown()).default({})
});

export const TeamSchema = z.object({
  externalRef: ExternalRefSchema,
  leagueExternalId: z.string().min(1),
  abbreviation: z.string().optional(),
  location: z.string().optional(),
  nickname: z.string().optional(),
  displayName: z.string().min(1),
  ownerDisplayNames: z.array(z.string()).default([]),
  logoUrl: z.string().url().optional(),
  playoffSeed: z.number().int().positive().optional(),
  finalStanding: z.number().int().positive().optional()
});

export const PlayerSchema = z.object({
  externalRef: ExternalRefSchema,
  fullName: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  proTeam: z.string().optional(),
  positions: z.array(z.string()).default([]),
  jersey: z.string().optional(),
  status: z.string().optional()
});

export const RosterEntrySchema = z.object({
  teamExternalId: z.string().min(1),
  player: PlayerSchema,
  lineupSlot: z.string().optional(),
  acquisitionType: z.string().optional(),
  acquisitionDate: z.string().datetime().optional(),
  injuryStatus: z.string().optional()
});

export const MatchupTeamScoreSchema = z.object({
  teamExternalId: z.string().min(1),
  score: z.number().optional(),
  projectedScore: z.number().optional(),
  winner: z.boolean().optional()
});

export const MatchupSchema = z.object({
  externalRef: ExternalRefSchema,
  leagueExternalId: z.string().min(1),
  season: z.number().int(),
  scoringPeriodId: z.number().int().positive(),
  home: MatchupTeamScoreSchema.optional(),
  away: MatchupTeamScoreSchema.optional(),
  winnerTeamExternalId: z.string().optional(),
  playoffTierType: z.string().optional()
});

export const DraftPickSchema = z.object({
  externalRef: ExternalRefSchema.optional(),
  leagueExternalId: z.string().min(1),
  season: z.number().int(),
  round: z.number().int().positive().optional(),
  roundPick: z.number().int().positive().optional(),
  overallPick: z.number().int().positive().optional(),
  teamExternalId: z.string().min(1).optional(),
  player: PlayerSchema.optional(),
  keeper: z.boolean().optional(),
  auctionPrice: z.number().optional()
});

export const TransactionItemSchema = z.object({
  type: z.enum(['add', 'drop', 'trade', 'draft', 'waiver', 'free_agent', 'unknown']),
  teamExternalId: z.string().optional(),
  player: PlayerSchema.optional(),
  notes: z.string().optional()
});

export const TransactionSchema = z.object({
  externalRef: ExternalRefSchema,
  leagueExternalId: z.string().min(1),
  season: z.number().int(),
  occurredAt: z.string().datetime().optional(),
  status: z.string().optional(),
  items: z.array(TransactionItemSchema).default([]),
  notes: z.string().optional()
});

export const LeagueSagaImportBundleSchema = z
  .object({
    metadata: ImportMetadataSchema,
    league: LeagueSchema,
    teams: z.array(TeamSchema).min(1, 'Import bundle must contain at least one team.'),
    rosterEntries: z.array(RosterEntrySchema).default([]),
    matchups: z.array(MatchupSchema).default([]),
    draftPicks: z.array(DraftPickSchema).default([]),
    transactions: z.array(TransactionSchema).default([])
  })
  .superRefine((bundle, ctx) => {
    const leagueId = bundle.league.externalRef.externalId;
    const teamIds = new Set<string>();
    const matchupIds = new Set<string>();
    const transactionIds = new Set<string>();

    function issue(message: string, path: Array<string | number>) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
    }

    if (bundle.metadata.source !== bundle.league.externalRef.provider) {
      issue('Import source must match the league provider.', ['metadata', 'source']);
    }

    for (const team of bundle.teams) {
      if (team.leagueExternalId !== leagueId) {
        issue(`Team ${team.externalRef.externalId} belongs to a different leagueExternalId.`, ['teams']);
      }
      if (teamIds.has(team.externalRef.externalId)) {
        issue(`Duplicate team external ID ${team.externalRef.externalId}.`, ['teams']);
      } else {
        teamIds.add(team.externalRef.externalId);
      }
    }

    for (const [index, entry] of bundle.rosterEntries.entries()) {
      if (!teamIds.has(entry.teamExternalId)) {
        issue(`Roster entry references unknown team ${entry.teamExternalId}.`, [
          'rosterEntries',
          index,
          'teamExternalId'
        ]);
      }
    }

    for (const [index, matchup] of bundle.matchups.entries()) {
      if (matchup.leagueExternalId !== leagueId) {
        issue(`Matchup ${matchup.externalRef.externalId} belongs to a different leagueExternalId.`, [
          'matchups',
          index
        ]);
      }
      if (matchup.season !== bundle.league.season) {
        issue(`Matchup ${matchup.externalRef.externalId} belongs to a different season.`, [
          'matchups',
          index,
          'season'
        ]);
      }
      if (matchupIds.has(matchup.externalRef.externalId)) {
        issue(`Duplicate matchup external ID ${matchup.externalRef.externalId}.`, ['matchups', index]);
      } else {
        matchupIds.add(matchup.externalRef.externalId);
      }
      const sideTeamIds = [matchup.home?.teamExternalId, matchup.away?.teamExternalId].filter(
        (value): value is string => Boolean(value)
      );
      for (const teamId of sideTeamIds) {
        if (!teamIds.has(teamId)) issue(`Matchup references unknown team ${teamId}.`, ['matchups', index]);
      }
      if (matchup.winnerTeamExternalId && !sideTeamIds.includes(matchup.winnerTeamExternalId)) {
        issue(`Matchup winner ${matchup.winnerTeamExternalId} is not a matchup participant.`, [
          'matchups',
          index,
          'winnerTeamExternalId'
        ]);
      }
    }

    for (const [index, pick] of bundle.draftPicks.entries()) {
      if (pick.leagueExternalId !== leagueId) {
        issue('Draft pick belongs to a different leagueExternalId.', ['draftPicks', index]);
      }
      if (pick.season !== bundle.league.season) {
        issue('Draft pick belongs to a different season.', ['draftPicks', index, 'season']);
      }
      if (pick.teamExternalId && !teamIds.has(pick.teamExternalId)) {
        issue(`Draft pick references unknown team ${pick.teamExternalId}.`, ['draftPicks', index, 'teamExternalId']);
      }
    }

    for (const [index, transaction] of bundle.transactions.entries()) {
      if (transaction.leagueExternalId !== leagueId) {
        issue(`Transaction ${transaction.externalRef.externalId} belongs to a different leagueExternalId.`, [
          'transactions',
          index
        ]);
      }
      if (transaction.season !== bundle.league.season) {
        issue(`Transaction ${transaction.externalRef.externalId} belongs to a different season.`, [
          'transactions',
          index,
          'season'
        ]);
      }
      if (transactionIds.has(transaction.externalRef.externalId)) {
        issue(`Duplicate transaction external ID ${transaction.externalRef.externalId}.`, ['transactions', index]);
      } else {
        transactionIds.add(transaction.externalRef.externalId);
      }
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
export type ExternalRef = z.infer<typeof ExternalRefSchema>;
export type LeagueSagaImportBundle = z.infer<typeof LeagueSagaImportBundleSchema>;
export type LeagueSagaImportPreview = z.infer<typeof LeagueSagaImportPreviewSchema>;
export type LeagueSagaImportTeam = z.infer<typeof TeamSchema>;
export type LeagueSagaImportPlayer = z.infer<typeof PlayerSchema>;
export type LeagueSagaRosterEntry = z.infer<typeof RosterEntrySchema>;
export type LeagueSagaMatchup = z.infer<typeof MatchupSchema>;
export type LeagueSagaDraftPick = z.infer<typeof DraftPickSchema>;
export type LeagueSagaTransaction = z.infer<typeof TransactionSchema>;
