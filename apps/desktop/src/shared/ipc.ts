import type { LeagueSagaHistoryImport, LeagueSagaImportPayload } from '@leaguesaga/import-contract';

export type SessionStatus = {
  isSignedIn: boolean;
  hasSwid: boolean;
  hasEspnS2: boolean;
  cookieCount: number;
  domains: string[];
  lastCheckedAt: string;
};

export type ImportSourceProvider = 'espn' | 'yahoo' | 'sleeper';

export type HelperSettings = {
  apiBaseUrl: string;
  importToken: string;
  importSessionId?: string;
  provider: ImportSourceProvider;
  leagueId: string;
  season?: number;
};

export type ImportParams = {
  leagueId: string;
  season?: number;
  importSessionId?: string;
};

export type UploadParams = {
  apiBaseUrl: string;
  importToken: string;
  bundle: LeagueSagaImportPayload;
};

export type UploadResult = {
  ok: boolean;
  status: number;
  code: 'ok' | 'unauthorized' | 'expired' | 'unavailable' | 'timeout' | 'offline' | 'canceled' | 'rejected';
  message: string;
  retryable: boolean;
  continuationUrl?: string;
  response?: unknown;
};

export type ImportResult = {
  history: LeagueSagaHistoryImport;
  warnings: string[];
};

export type RuntimeConfig = {
  apiBaseUrl: string;
  isDevelopment: boolean;
  mockImportsEnabled: boolean;
};

export type UpdateInfo = {
  status: 'available' | 'current' | 'unavailable';
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
};

export type DeepLinkSettings = Partial<HelperSettings>;

export type LeagueSagaBridge = {
  appVersion: () => Promise<string>;
  runtimeConfig: () => Promise<RuntimeConfig>;
  rendererReady: () => Promise<DeepLinkSettings | null>;
  getSettings: () => Promise<HelperSettings>;
  saveSettings: (settings: HelperSettings) => Promise<HelperSettings>;
  openEspnLogin: (params: Pick<ImportParams, 'leagueId' | 'season'>) => Promise<void>;
  getEspnSessionStatus: () => Promise<SessionStatus>;
  clearEspnSession: () => Promise<void>;
  importFromEspn: (params: ImportParams) => Promise<ImportResult>;
  cancelEspnImport: () => Promise<void>;
  createMockImport: (params: ImportParams) => Promise<ImportResult>;
  saveBundleToDisk: (bundle: LeagueSagaImportPayload) => Promise<{ canceled: boolean; filePath?: string }>;
  uploadBundle: (params: UploadParams) => Promise<UploadResult>;
  cancelUpload: () => Promise<void>;
  openLeagueSagaUrl: (url: string) => Promise<void>;
  openUpdateUrl: (url: string) => Promise<void>;
  openProjectUrl: (url: string) => Promise<void>;
  checkForUpdates: () => Promise<UpdateInfo>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  saveDiagnostics: () => Promise<{ canceled: boolean; filePath?: string }>;
  onDeepLink: (callback: (settings: DeepLinkSettings) => void) => () => void;
};
