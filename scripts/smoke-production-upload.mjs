import { createMockHistoryImport, validateHistoryImport } from '@leaguesaga/import-contract';

const token = process.env.LEAGUESAGA_SMOKE_TOKEN;
const productionApiBase = 'https://portal.leaguesaga.com';
const apiBase = (process.env.LEAGUESAGA_SMOKE_API_BASE ?? productionApiBase).replace(/\/$/, '');
const importSessionId = process.env.LEAGUESAGA_SMOKE_SESSION_ID;
if (!token || !importSessionId) throw new Error('LEAGUESAGA_SMOKE_TOKEN and LEAGUESAGA_SMOKE_SESSION_ID are required.');
if (apiBase !== productionApiBase) throw new Error(`The production smoke test only permits ${productionApiBase}.`);

const leagueExternalId = '424242';
const generated = createMockHistoryImport([new Date().getUTCFullYear()], {
  leagueExternalId,
  importSessionId,
  helperVersion: '0.3.1',
  platform: process.platform
});
const bundle = validateHistoryImport({
  ...generated,
  provider: 'espn',
  leagueName: 'LeagueSaga Release Smoke Test',
  seasons: generated.seasons.map((season) => ({
    ...season,
    league: { ...season.league, name: 'LeagueSaga Release Smoke Test' },
    rosterEntries: [],
    matchups: [],
    draftPicks: [],
    transactions: []
  })),
  warnings: ['Automated sanitized production smoke test.']
});

const response = await fetch(`${apiBase}/api/import-helper/espn/preview`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json', 'x-leaguesaga-import-token': token },
  body: JSON.stringify(bundle),
  signal: AbortSignal.timeout(30_000)
});
if (!response.ok) throw new Error(`Production preview smoke test failed with HTTP ${response.status}.`);
const body = await response.json().catch(() => ({}));
const continuation =
  body && typeof body === 'object' ? (body.continuationUrl ?? body.previewUrl ?? body.url) : undefined;
if (typeof continuation === 'string' && !continuation.startsWith(`${productionApiBase}/`)) {
  throw new Error('Production preview returned an untrusted continuation URL.');
}
console.log(`PRODUCTION_UPLOAD_SMOKE_OK status=${response.status}`);
