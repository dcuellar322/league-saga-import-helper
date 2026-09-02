import { describe, expect, it } from 'vitest';
import {
  EspnImportParamsSchema,
  EspnOpenLoginParamsSchema,
  MockImportParamsSchema,
  createSettingsSchema,
  createUploadParamsSchema,
  findDeepLinkArg,
  isAllowedLocalRendererUrl,
  normalizeApiBaseUrl,
  normalizeLeagueSagaNavigationUrl,
  parseDeepLinkSettings
} from './validation.js';

describe('URL and deep-link validation', () => {
  it('normalizes production and local LeagueSaga API URLs', () => {
    expect(normalizeApiBaseUrl('https://portal.leaguesaga.com/api/v1///', { allowLocalhost: false })).toBe(
      'https://portal.leaguesaga.com/api/v1'
    );
    expect(normalizeApiBaseUrl('http://127.0.0.1:15173/', { allowLocalhost: true })).toBe('http://127.0.0.1:15173');
  });

  it('rejects unsafe API URL shapes', () => {
    expect(() => normalizeApiBaseUrl('https://user:secret@portal.leaguesaga.com', { allowLocalhost: false })).toThrow(
      'must not contain credentials'
    );
    expect(() => normalizeApiBaseUrl('http://portal.leaguesaga.com', { allowLocalhost: false })).toThrow(
      'must be https://portal.leaguesaga.com'
    );
    expect(() => normalizeApiBaseUrl('http://example.com', { allowLocalhost: true })).toThrow(
      'must be https://portal.leaguesaga.com'
    );
    expect(() => normalizeApiBaseUrl('https://www.leaguesaga.com', { allowLocalhost: false })).toThrow();
    expect(() =>
      normalizeApiBaseUrl('https://portal.leaguesaga.com.evil.example', { allowLocalhost: false })
    ).toThrow();
  });

  it('parses LeagueSaga import deep links into helper settings', () => {
    const settings = parseDeepLinkSettings(
      'leaguesaga-import://start?apiBase=https%3A%2F%2Fportal.leaguesaga.com&token=session-token&leagueId=123456&startYear=2026&importSessionId=import-1',
      { allowLocalhost: false }
    );

    expect(settings).toEqual({
      apiBaseUrl: 'https://portal.leaguesaga.com',
      importToken: 'session-token',
      importSessionId: 'import-1',
      leagueId: '123456',
      season: 2026
    });
  });

  it('preserves provider context for future non-ESPN deep links', () => {
    expect(
      parseDeepLinkSettings('leaguesaga-import://start?provider=sleeper&leagueId=123456789012345678', {
        allowLocalhost: false
      })
    ).toEqual({ provider: 'sleeper', leagueId: '123456789012345678' });
  });

  it('accepts the optional startYear deep-link parameter', () => {
    expect(
      parseDeepLinkSettings('leaguesaga-import://start?leagueId=123&startYear=2019', { allowLocalhost: false })
    ).toEqual({ leagueId: '123', season: 2019 });
  });

  it('restricts LeagueSaga continuation URLs', () => {
    expect(
      normalizeLeagueSagaNavigationUrl('https://portal.leaguesaga.com/imports/preview?id=1', {
        allowLocalhost: false
      })
    ).toBe('https://portal.leaguesaga.com/imports/preview?id=1');
    expect(() =>
      normalizeLeagueSagaNavigationUrl('https://evil.example/imports/preview', { allowLocalhost: false })
    ).toThrow();
  });

  it('ignores invalid or unrelated deep links', () => {
    expect(parseDeepLinkSettings('https://portal.leaguesaga.com', { allowLocalhost: false })).toBeNull();
    expect(parseDeepLinkSettings('leaguesaga-import://session?leagueId=abc', { allowLocalhost: false })).toBeNull();
    expect(
      parseDeepLinkSettings(
        'leaguesaga-import://start?apiBase=http%3A%2F%2Flocalhost%3A15173&token=secret&leagueId=123',
        { allowLocalhost: false }
      )
    ).toBeNull();
  });

  it('finds deep-link argv values from packaged and development invocations', () => {
    expect(
      findDeepLinkArg(['/Applications/LeagueSaga Import Helper.app', 'leaguesaga-import://session?leagueId=1'])
    ).toBe('leaguesaga-import://session?leagueId=1');
    expect(findDeepLinkArg(['/usr/local/bin/electron', '.', '--flag'])).toBeUndefined();
  });

  it('allows only the local Vite renderer URL in development', () => {
    expect(isAllowedLocalRendererUrl('http://127.0.0.1:5173')).toBe(true);
    expect(isAllowedLocalRendererUrl('http://localhost:5173')).toBe(true);
    expect(isAllowedLocalRendererUrl('http://localhost:5174')).toBe(false);
    expect(isAllowedLocalRendererUrl('https://localhost:5173')).toBe(false);
    expect(isAllowedLocalRendererUrl('not-a-url')).toBe(false);
  });

  it('validates persisted settings and upload parameters', () => {
    const settings = createSettingsSchema({ allowLocalhost: true }).parse({
      apiBaseUrl: 'http://localhost:15173/api/',
      importToken: '',
      provider: 'espn',
      leagueId: ' 123 ',
      season: ''
    });

    expect(settings).toEqual({
      apiBaseUrl: 'http://localhost:15173/api',
      importToken: '',
      provider: 'espn',
      leagueId: '123',
      season: undefined
    });

    expect(() =>
      createUploadParamsSchema({ allowLocalhost: false }).parse({
        apiBaseUrl: 'https://portal.leaguesaga.com',
        importToken: '',
        bundle: {}
      })
    ).toThrow();
  });

  it('validates import parameter boundaries', () => {
    expect(EspnOpenLoginParamsSchema.parse({ leagueId: '123', season: '' })).toEqual({
      leagueId: '123',
      season: undefined
    });
    expect(EspnImportParamsSchema.parse({ leagueId: '123', season: 2026, importSessionId: 'session-1' })).toEqual({
      leagueId: '123',
      season: 2026,
      importSessionId: 'session-1'
    });
    expect(MockImportParamsSchema.parse({ leagueId: 'mock_league-1', season: undefined })).toEqual({
      leagueId: 'mock_league-1',
      season: undefined
    });
    expect(() => EspnImportParamsSchema.parse({ leagueId: 'abc', season: 2026 })).toThrow();
    expect(() => MockImportParamsSchema.parse({ leagueId: 'bad league', season: 2026 })).toThrow();
  });
});
