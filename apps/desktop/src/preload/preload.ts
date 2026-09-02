import { contextBridge, ipcRenderer } from 'electron';
import type { DeepLinkSettings, HelperSettings, ImportParams, LeagueSagaBridge, UploadParams } from '../shared/ipc.js';
import type { LeagueSagaHistoryImport } from '@leaguesaga/import-contract';

const bridge: LeagueSagaBridge = {
  appVersion: () => ipcRenderer.invoke('app:version'),
  runtimeConfig: () => ipcRenderer.invoke('app:runtime-config'),
  rendererReady: () => ipcRenderer.invoke('app:renderer-ready'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: HelperSettings) => ipcRenderer.invoke('settings:save', settings),
  openEspnLogin: (params: Pick<ImportParams, 'leagueId' | 'season'>) => ipcRenderer.invoke('espn:open-login', params),
  getEspnSessionStatus: () => ipcRenderer.invoke('espn:session-status'),
  clearEspnSession: () => ipcRenderer.invoke('espn:clear-session'),
  importFromEspn: (params: ImportParams) => ipcRenderer.invoke('espn:import', params),
  cancelEspnImport: () => ipcRenderer.invoke('espn:cancel-import'),
  createMockImport: (params: ImportParams) => ipcRenderer.invoke('mock:import', params),
  saveBundleToDisk: (bundle: LeagueSagaHistoryImport) => ipcRenderer.invoke('bundle:save-to-disk', bundle),
  uploadBundle: (params: UploadParams) => ipcRenderer.invoke('bundle:upload', params),
  cancelUpload: () => ipcRenderer.invoke('bundle:cancel-upload'),
  openLeagueSagaUrl: (url: string) => ipcRenderer.invoke('app:open-leaguesaga-url', url),
  openUpdateUrl: (url: string) => ipcRenderer.invoke('app:open-update-url', url),
  openProjectUrl: (url: string) => ipcRenderer.invoke('app:open-project-url', url),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  saveDiagnostics: () => ipcRenderer.invoke('diagnostics:save'),
  onDeepLink: (callback: (settings: DeepLinkSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: DeepLinkSettings) => callback(settings);
    ipcRenderer.on('app:deep-link', listener);
    return () => ipcRenderer.removeListener('app:deep-link', listener);
  }
};

contextBridge.exposeInMainWorld('leagueSaga', bridge);
