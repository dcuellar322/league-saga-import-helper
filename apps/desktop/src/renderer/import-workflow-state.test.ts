import { createMockHistoryImport } from '@leaguesaga/import-contract';
import { describe, expect, it } from 'vitest';
import { currentSeasonYear } from '../shared/environment';
import {
  canOpenImportStep,
  createInitialImportWorkflowState,
  getImportWorkflowValidation,
  importWorkflowReducer,
  type ImportWorkflowState
} from './import-workflow-state';

function withValidEspnDetails(state = createInitialImportWorkflowState()): ImportWorkflowState {
  return importWorkflowReducer(state, {
    type: 'settings-changed',
    settings: { ...state.settings, leagueId: '424242', season: currentSeasonYear() }
  });
}

describe('import workflow state', () => {
  it('guards navigation using workflow prerequisites', () => {
    const initial = createInitialImportWorkflowState();
    expect(canOpenImportStep(initial, 'provider')).toBe(true);
    expect(canOpenImportStep(initial, 'details')).toBe(true);
    expect(canOpenImportStep(initial, 'connect')).toBe(false);
    expect(canOpenImportStep(initial, 'preview')).toBe(false);
    expect(canOpenImportStep(initial, 'upload')).toBe(false);
    expect(importWorkflowReducer(initial, { type: 'go-to-step', step: 'connect' })).toBe(initial);

    const ready = withValidEspnDetails(initial);
    const connected = importWorkflowReducer(ready, { type: 'go-to-step', step: 'connect' });
    expect(connected.step).toBe('connect');
  });

  it('applies deep-link values regardless of initialization completion order', () => {
    const linked = importWorkflowReducer(createInitialImportWorkflowState(), {
      type: 'deep-link-received',
      settings: {
        apiBaseUrl: 'https://portal.leaguesaga.com',
        importToken: 'one-time-token',
        importSessionId: 'session-1',
        leagueId: '1234'
      }
    });
    const configured = importWorkflowReducer(linked, {
      type: 'runtime-config-loaded',
      config: { apiBaseUrl: 'http://localhost:15173', mockImportsEnabled: true }
    });
    const loaded = importWorkflowReducer(configured, {
      type: 'settings-loaded',
      settings: { ...configured.settings, apiBaseUrl: 'http://localhost:15173', leagueId: 'old-league' }
    });

    expect(loaded.settings).toMatchObject({
      apiBaseUrl: 'https://portal.leaguesaga.com',
      importToken: 'one-time-token',
      importSessionId: 'session-1',
      provider: 'espn',
      leagueId: '1234'
    });
    expect(loaded.step).toBe('details');
    expect(loaded.notice?.title).toBe('Connected to LeagueSaga');

    const settingsFirst = importWorkflowReducer(createInitialImportWorkflowState(), {
      type: 'settings-loaded',
      settings: { ...loaded.settings, importToken: '', leagueId: 'saved-league' }
    });
    const lateLink = importWorkflowReducer(settingsFirst, {
      type: 'deep-link-received',
      settings: { importToken: 'late-token' }
    });
    expect(lateLink.settings.leagueId).toBe('saved-league');
    expect(lateLink.settings.importToken).toBe('late-token');
    expect(lateLink.step).toBe('provider');
  });

  it('resets provider-specific progress when the provider changes', () => {
    const history = createMockHistoryImport([currentSeasonYear()]);
    const imported = importWorkflowReducer(withValidEspnDetails(), {
      type: 'import-ready',
      history,
      notice: { tone: 'success', title: 'Ready', message: 'Ready.' }
    });
    const withResult = importWorkflowReducer(imported, {
      type: 'upload-finished',
      result: { ok: false, status: 503, code: 'unavailable', message: 'Retry.', retryable: true }
    });
    const yahoo = importWorkflowReducer(withResult, { type: 'provider-chosen', provider: 'yahoo' });

    expect(yahoo.settings).toMatchObject({ provider: 'yahoo', leagueId: '', season: undefined });
    expect(yahoo.sessionStatus.isSignedIn).toBe(false);
    expect(yahoo.history).toBeNull();
    expect(yahoo.uploadResult).toBeNull();
    expect(yahoo.step).toBe('details');

    const unchanged = importWorkflowReducer(yahoo, { type: 'provider-chosen', provider: 'yahoo' });
    expect(unchanged.settings).toBe(yahoo.settings);
  });

  it('retains credentials for retryable uploads and consumes one-time credentials for terminal results', () => {
    const linked = importWorkflowReducer(withValidEspnDetails(), {
      type: 'deep-link-received',
      settings: { importToken: 'token', importSessionId: 'session' }
    });
    const retryable = importWorkflowReducer(linked, {
      type: 'upload-finished',
      result: { ok: false, status: 503, code: 'unavailable', message: 'Retry.', retryable: true }
    });
    expect(retryable.settings.importToken).toBe('token');
    expect(retryable.deepLinkSettings?.importSessionId).toBe('session');

    const completed = importWorkflowReducer(retryable, {
      type: 'upload-finished',
      result: { ok: true, status: 200, code: 'ok', message: 'Done.', retryable: false }
    });
    expect(completed.settings.importToken).toBe('');
    expect(completed.settings.importSessionId).toBeUndefined();
    expect(completed.deepLinkSettings?.importToken).toBe('');
    expect(completed.deepLinkSettings?.importSessionId).toBeUndefined();
    expect(completed.step).toBe('upload');
  });

  it('validates provider-specific IDs, season bounds, and upload tokens', () => {
    const initial = createInitialImportWorkflowState();
    expect(getImportWorkflowValidation(initial.settings)).toMatchObject({
      seasonIsValid: true,
      leagueIdIsValid: false,
      detailsAreValid: false,
      canImport: false,
      canUpload: false
    });
    expect(
      getImportWorkflowValidation({
        ...initial.settings,
        provider: 'yahoo',
        leagueId: 'league-key',
        season: 1999,
        importToken: ' token '
      })
    ).toMatchObject({
      seasonIsValid: false,
      leagueIdIsValid: true,
      detailsAreValid: false,
      canImport: false,
      canUpload: true
    });
    expect(
      getImportWorkflowValidation({ ...initial.settings, leagueId: '1234', season: currentSeasonYear() + 1 })
        .seasonIsValid
    ).toBe(false);
  });
});
