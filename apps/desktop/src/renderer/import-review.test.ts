import { describe, expect, it } from 'vitest';
import { createMockImportBundle, validateImportBundle } from '@leaguesaga/import-contract';
import { createDeliveryBundle, DEFAULT_INCLUDED_CATEGORIES } from './import-review.js';

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
});
