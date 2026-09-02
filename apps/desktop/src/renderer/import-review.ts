import type { LeagueSagaHistoryImport, LeagueSagaHistorySeason } from '@leaguesaga/import-contract';

export type OptionalImportCategory = 'rosterEntries' | 'matchups' | 'draftPicks' | 'transactions';
export type IncludedCategories = Record<OptionalImportCategory, boolean>;

export const DEFAULT_INCLUDED_CATEGORIES: IncludedCategories = {
  rosterEntries: true,
  matchups: true,
  draftPicks: true,
  transactions: true
};

export function createDeliveryHistory(
  history: LeagueSagaHistoryImport,
  included: IncludedCategories
): LeagueSagaHistoryImport {
  return {
    ...history,
    seasons: history.seasons.map((season) => createDeliverySeason(season, included))
  };
}

function createDeliverySeason(season: LeagueSagaHistorySeason, included: IncludedCategories): LeagueSagaHistorySeason {
  const excluded = (Object.entries(included) as Array<[OptionalImportCategory, boolean]>)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  return {
    ...season,
    warnings: [...season.warnings, ...excluded.map((category) => `${category} excluded by the user before upload.`)],
    rosterEntries: included.rosterEntries ? season.rosterEntries : [],
    matchups: included.matchups ? season.matchups : [],
    draftPicks: included.draftPicks ? season.draftPicks : [],
    transactions: included.transactions ? season.transactions : [],
    transactionCoverage: included.transactions
      ? season.transactionCoverage
      : {
          available: false,
          detailLevel: 'unavailable',
          periodsRequested: 0,
          periodsSupported: 0,
          limitations: ['Transaction data was excluded by the user before upload.']
        },
    transactionSummaries: included.transactions ? season.transactionSummaries : [],
    tradePartnerSummaries: included.transactions ? season.tradePartnerSummaries : []
  };
}
