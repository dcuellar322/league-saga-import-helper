import type { LeagueSagaHistoryImport, LeagueSagaImportBundle } from '@leaguesaga/import-contract';

export type OptionalImportCategory = 'rosterEntries' | 'matchups' | 'draftPicks' | 'transactions';
export type IncludedCategories = Record<OptionalImportCategory, boolean>;

export const DEFAULT_INCLUDED_CATEGORIES: IncludedCategories = {
  rosterEntries: true,
  matchups: true,
  draftPicks: true,
  transactions: true
};

export function createDeliveryBundle(
  bundle: LeagueSagaImportBundle,
  included: IncludedCategories
): LeagueSagaImportBundle {
  const excluded = (Object.entries(included) as Array<[OptionalImportCategory, boolean]>)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  return {
    ...bundle,
    metadata: {
      ...bundle.metadata,
      warnings: [
        ...bundle.metadata.warnings,
        ...excluded.map((category) => `${category} excluded by the user before upload.`)
      ]
    },
    rosterEntries: included.rosterEntries ? bundle.rosterEntries : [],
    matchups: included.matchups ? bundle.matchups : [],
    draftPicks: included.draftPicks ? bundle.draftPicks : [],
    transactions: included.transactions ? bundle.transactions : []
  };
}

export function createDeliveryHistory(
  history: LeagueSagaHistoryImport,
  included: IncludedCategories
): LeagueSagaHistoryImport {
  return {
    ...history,
    seasons: history.seasons.map((bundle) => createDeliveryBundle(bundle, included))
  };
}
