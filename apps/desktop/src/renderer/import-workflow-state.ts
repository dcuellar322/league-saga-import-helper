import type { LeagueSagaHistoryImport } from '@leaguesaga/import-contract';
import type {
  DeepLinkSettings,
  HelperSettings,
  ImportSourceProvider,
  RuntimeConfig,
  SessionStatus,
  UploadResult
} from '../shared/ipc';
import { currentSeasonYear, defaultLeagueSagaApiBaseUrl } from '../shared/environment';
import type { BusyAction, Notice } from './components';
import { DEFAULT_INCLUDED_CATEGORIES, type IncludedCategories } from './import-review';

export type ImportStep = 'provider' | 'details' | 'connect' | 'preview' | 'upload';

export const IMPORT_STEPS: ImportStep[] = ['provider', 'details', 'connect', 'preview', 'upload'];

export const DEFAULT_SESSION_STATUS: SessionStatus = {
  isSignedIn: false,
  hasSwid: false,
  hasEspnS2: false
};

export const DEFAULT_HELPER_SETTINGS: HelperSettings = {
  apiBaseUrl: defaultLeagueSagaApiBaseUrl(true),
  importToken: '',
  provider: 'espn',
  leagueId: '',
  season: undefined
};

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  apiBaseUrl: DEFAULT_HELPER_SETTINGS.apiBaseUrl,
  mockImportsEnabled: false
};

export type ImportWorkflowState = {
  runtimeConfig: RuntimeConfig;
  step: ImportStep;
  settings: HelperSettings;
  deepLinkSettings: DeepLinkSettings | null;
  sessionStatus: SessionStatus;
  history: LeagueSagaHistoryImport | null;
  busyAction: BusyAction | null;
  notice: Notice | null;
  uploadResult: UploadResult | null;
  includedCategories: IncludedCategories;
};

export type ImportWorkflowAction =
  | { type: 'deep-link-received'; settings: DeepLinkSettings }
  | { type: 'runtime-config-loaded'; config: RuntimeConfig }
  | { type: 'settings-loaded'; settings: HelperSettings }
  | { type: 'settings-saved'; settings: HelperSettings }
  | { type: 'settings-changed'; settings: HelperSettings }
  | { type: 'session-status-changed'; status: SessionStatus }
  | { type: 'go-to-step'; step: ImportStep }
  | { type: 'provider-chosen'; provider: ImportSourceProvider }
  | { type: 'busy-started'; action: BusyAction; clearUploadResult?: boolean }
  | { type: 'busy-finished' }
  | { type: 'notice-changed'; notice: Notice | null }
  | { type: 'import-ready'; history: LeagueSagaHistoryImport; notice: Notice }
  | { type: 'upload-finished'; result: UploadResult }
  | { type: 'included-categories-changed'; categories: IncludedCategories };

export type ImportWorkflowValidation = {
  seasonIsValid: boolean;
  leagueIdIsValid: boolean;
  detailsAreValid: boolean;
  canImport: boolean;
  canUpload: boolean;
};

export function createInitialImportWorkflowState(): ImportWorkflowState {
  return {
    runtimeConfig: DEFAULT_RUNTIME_CONFIG,
    step: 'provider',
    settings: DEFAULT_HELPER_SETTINGS,
    deepLinkSettings: null,
    sessionStatus: DEFAULT_SESSION_STATUS,
    history: null,
    busyAction: null,
    notice: null,
    uploadResult: null,
    includedCategories: DEFAULT_INCLUDED_CATEGORIES
  };
}

export function getImportWorkflowValidation(settings: HelperSettings): ImportWorkflowValidation {
  const seasonIsValid =
    settings.season === undefined ||
    (Number.isInteger(settings.season) && settings.season >= 2000 && settings.season <= currentSeasonYear());
  const leagueIdIsValid =
    settings.provider === 'espn'
      ? /^\d{1,12}$/.test(settings.leagueId.trim())
      : settings.leagueId.trim().length > 0 && settings.leagueId.trim().length <= 64;
  const detailsAreValid = leagueIdIsValid && seasonIsValid;
  return {
    seasonIsValid,
    leagueIdIsValid,
    detailsAreValid,
    canImport: settings.provider === 'espn' && detailsAreValid,
    canUpload: Boolean(settings.importToken.trim())
  };
}

export function canOpenImportStep(state: ImportWorkflowState, step: ImportStep): boolean {
  if (step === 'provider' || step === 'details') return true;
  if (step === 'connect') return getImportWorkflowValidation(state.settings).detailsAreValid;
  return Boolean(state.history);
}

export function importWorkflowReducer(state: ImportWorkflowState, action: ImportWorkflowAction): ImportWorkflowState {
  switch (action.type) {
    case 'deep-link-received': {
      const settings =
        action.settings.leagueId && !action.settings.provider
          ? { ...action.settings, provider: 'espn' as const }
          : action.settings;
      const deepLinkSettings = { ...(state.deepLinkSettings ?? {}), ...settings };
      return {
        ...state,
        deepLinkSettings,
        settings: { ...state.settings, ...settings },
        step: action.settings.leagueId ? 'details' : 'provider',
        notice: {
          tone: 'success',
          title: 'Connected to LeagueSaga',
          message: 'Your league details and secure import session are ready. Confirm them below to continue.'
        }
      };
    }
    case 'runtime-config-loaded':
      return {
        ...state,
        runtimeConfig: action.config,
        settings: {
          ...state.settings,
          apiBaseUrl: state.deepLinkSettings?.apiBaseUrl ?? action.config.apiBaseUrl
        }
      };
    case 'settings-loaded':
      return {
        ...state,
        settings: state.deepLinkSettings ? { ...action.settings, ...state.deepLinkSettings } : action.settings
      };
    case 'settings-saved':
    case 'settings-changed':
      return { ...state, settings: action.settings };
    case 'session-status-changed':
      return { ...state, sessionStatus: action.status };
    case 'go-to-step':
      return canOpenImportStep(state, action.step) ? { ...state, step: action.step, notice: null } : state;
    case 'provider-chosen':
      return {
        ...state,
        settings:
          state.settings.provider === action.provider
            ? state.settings
            : { ...state.settings, provider: action.provider, leagueId: '', season: undefined },
        sessionStatus: DEFAULT_SESSION_STATUS,
        history: null,
        uploadResult: null,
        step: 'details',
        notice: null
      };
    case 'busy-started':
      return {
        ...state,
        busyAction: action.action,
        notice: null,
        uploadResult: action.clearUploadResult ? null : state.uploadResult
      };
    case 'busy-finished':
      return { ...state, busyAction: null };
    case 'notice-changed':
      return { ...state, notice: action.notice };
    case 'import-ready':
      return {
        ...state,
        history: action.history,
        includedCategories: DEFAULT_INCLUDED_CATEGORIES,
        step: 'preview',
        notice: action.notice
      };
    case 'upload-finished': {
      const consumesToken =
        action.result.ok || action.result.code === 'expired' || action.result.code === 'unauthorized';
      return {
        ...state,
        uploadResult: action.result,
        step: 'upload',
        notice: null,
        deepLinkSettings:
          consumesToken && state.deepLinkSettings
            ? { ...state.deepLinkSettings, importToken: '', importSessionId: undefined }
            : state.deepLinkSettings,
        settings: consumesToken ? { ...state.settings, importToken: '', importSessionId: undefined } : state.settings
      };
    }
    case 'included-categories-changed':
      return { ...state, includedCategories: action.categories };
  }
}
