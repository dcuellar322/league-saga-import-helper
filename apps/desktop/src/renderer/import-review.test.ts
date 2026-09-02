import { describe, expect, it } from 'vitest';
import {
  createMockHistoryImport,
  createMockImportBundle,
  validateHistoryImport,
  validateImportBundle
} from '@leaguesaga/import-contract';
import { createDeliveryBundle, createDeliveryHistory, DEFAULT_INCLUDED_CATEGORIES } from './import-review.js';

describe('renderer import review helpers', () => {
  it('creates a valid reviewed bundle without excluded categories', () => {
    const source = createMockImportBundle();
    const reviewed = createDeliveryBundle(source, {
      ...DEFAULT_INCLUDED_CATEGORIES,
      rosterEntries: false,
      matchups: false
    });
    expect(reviewed.rosterEntries).toEqual([]);
    expect(reviewed.matchups).toEqual([]);
    expect(reviewed.teams).toEqual(source.teams);
    expect(reviewed.metadata.warnings).toContain('rosterEntries excluded by the user before upload.');
    expect(() => validateImportBundle(reviewed)).not.toThrow();
  });

  it('applies review choices to every season in a history import', () => {
    const source = createMockHistoryImport();
    const reviewed = createDeliveryHistory(source, {
      ...DEFAULT_INCLUDED_CATEGORIES,
      rosterEntries: false
    });

    expect(reviewed.seasons.every((bundle) => bundle.rosterEntries.length === 0)).toBe(true);
    expect(reviewed.seasons.every((bundle) => bundle.teams.length > 0)).toBe(true);
    expect(() => validateHistoryImport(reviewed)).not.toThrow();
  });
});
