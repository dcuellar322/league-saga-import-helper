import { useEffect, useMemo, useRef, useState } from 'react';
import type { LeagueSagaHistoryImport } from '@leaguesaga/import-contract';
import type {
  DeepLinkSettings,
  HelperSettings,
  ImportSourceProvider,
  RuntimeConfig,
  SessionStatus,
  UpdateInfo,
  UploadResult
} from '../shared/ipc';
import { currentSeasonYear, defaultLeagueSagaApiBaseUrl } from '../shared/environment';
import leagueSagaLogoUrl from '../../assets/league-saga-mark.png';
import leagueSagaWordmarkUrl from '../../assets/league-saga-wordmark-reverse.svg';
import { createDeliveryHistory, DEFAULT_INCLUDED_CATEGORIES, type IncludedCategories } from './import-review';
import { formatError } from './errors';
import {
  ConnectStep,
  Icon,
  LeagueDetailsStep,
  NoticeBanner,
  PreviewStep,
  ProviderStep,
  SettingsModal,
  StepButton,
  UploadStep,
  providerName,
  type BusyAction,
  type Notice,
  type UpdateBusy
} from './components';

type Step = 'provider' | 'details' | 'connect' | 'preview' | 'upload';

const STEPS: Step[] = ['provider', 'details', 'connect', 'preview', 'upload'];

const DEFAULT_STATUS: SessionStatus = {
  isSignedIn: false,
  hasSwid: false,
  hasEspnS2: false,
  cookieCount: 0,
  domains: [],
  lastCheckedAt: new Date().toISOString()
};

const DEFAULT_SETTINGS: HelperSettings = {
  apiBaseUrl: defaultLeagueSagaApiBaseUrl(true),
  importToken: '',
  provider: 'espn',
  leagueId: '',
  season: undefined
};

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  apiBaseUrl: DEFAULT_SETTINGS.apiBaseUrl,
  isDevelopment: false,
  mockImportsEnabled: false
};

export default function App() {
  const [version, setVersion] = useState('');
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(DEFAULT_RUNTIME_CONFIG);
  const [step, setStep] = useState<Step>('provider');
  const [settings, setSettings] = useState<HelperSettings>(DEFAULT_SETTINGS);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(DEFAULT_STATUS);
  const [history, setHistory] = useState<LeagueSagaHistoryImport | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [includedCategories, setIncludedCategories] = useState<IncludedCategories>(DEFAULT_INCLUDED_CATEGORIES);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateBusy, setUpdateBusy] = useState<UpdateBusy>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const deepLinkSettingsRef = useRef<DeepLinkSettings | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;

    function reportInitializationError(error: unknown) {
      if (disposed) return;
      setNotice({
        tone: 'error',
        title: 'The helper could not finish starting',
        message: formatError(error)
      });
    }

    function applyDeepLink(parsed: DeepLinkSettings) {
      if (disposed) return;
      const providerAwareSettings =
        parsed.leagueId && !parsed.provider ? { ...parsed, provider: 'espn' as const } : parsed;
      deepLinkSettingsRef.current = { ...(deepLinkSettingsRef.current ?? {}), ...providerAwareSettings };
      setSettings((current) => ({ ...current, ...providerAwareSettings }));
      setStep(parsed.leagueId ? 'details' : 'provider');
      setNotice({
        tone: 'success',
        title: 'Connected to LeagueSaga',
        message: 'Your league details and secure import session are ready. Confirm them below to continue.'
      });
    }

    const unsubscribe = window.leagueSaga.onDeepLink(applyDeepLink);

    void window.leagueSaga
      .appVersion()
      .then((nextVersion) => {
        if (!disposed) setVersion(nextVersion);
      })
      .catch(reportInitializationError);
    void window.leagueSaga
      .runtimeConfig()
      .then((config) => {
        if (disposed) return;
        setRuntimeConfig(config);
        setSettings((current) => ({
          ...current,
          apiBaseUrl: deepLinkSettingsRef.current?.apiBaseUrl ?? config.apiBaseUrl
        }));
      })
      .catch(reportInitializationError);
    void window.leagueSaga
      .getSettings()
      .then((loaded) => {
        if (disposed) return;
        const deepLinkSettings = deepLinkSettingsRef.current;
        setSettings(deepLinkSettings ? { ...loaded, ...deepLinkSettings } : loaded);
      })
      .catch(reportInitializationError);
    void window.leagueSaga
      .getEspnSessionStatus()
      .then((status) => {
        if (!disposed) setSessionStatus(status);
      })
      .catch(reportInitializationError);
    void window.leagueSaga
      .rendererReady()
      .then((pendingDeepLink) => {
        if (pendingDeepLink) applyDeepLink(pendingDeepLink);
      })
      .catch(reportInitializationError);
    void window.leagueSaga
      .checkForUpdates()
      .then((nextUpdate) => {
        if (!disposed) setUpdateInfo(nextUpdate);
      })
      .catch(reportInitializationError);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [settingsOpen]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [step]);

  useEffect(() => {
    if (
      step !== 'connect' ||
      settings.provider !== 'espn' ||
      sessionStatus.isSignedIn ||
      busyAction === 'clearing-session'
    )
      return;
    let disposed = false;
    const poll = async () => {
      try {
        const status = await window.leagueSaga.getEspnSessionStatus();
        if (disposed) return;
        setSessionStatus(status);
        if (status.isSignedIn) {
          setNotice({
            tone: 'success',
            title: 'ESPN session ready',
            message: 'Sign-in was detected automatically. You can import this season now.'
          });
        }
      } catch {
        // Manual status checking remains available if a background poll fails.
      }
    };
    const interval = window.setInterval(() => void poll(), 1_500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [step, settings.provider, sessionStatus.isSignedIn, busyAction]);

  const seasonIsValid = useMemo(
    () =>
      settings.season === undefined ||
      (Number.isInteger(settings.season) && settings.season >= 2000 && settings.season <= currentSeasonYear()),
    [settings.season]
  );
  const leagueIdIsValid =
    settings.provider === 'espn'
      ? /^\d{1,12}$/.test(settings.leagueId.trim())
      : settings.leagueId.trim().length > 0 && settings.leagueId.trim().length <= 64;
  const detailsAreValid = leagueIdIsValid && seasonIsValid;
  const canImport = settings.provider === 'espn' && detailsAreValid;
  const canUpload = Boolean(settings.importToken.trim());
  const deliveryHistory = useMemo(
    () => (history ? createDeliveryHistory(history, includedCategories) : null),
    [history, includedCategories]
  );
  const stepIndex = STEPS.indexOf(step);

  async function refreshStatus() {
    const status = await window.leagueSaga.getEspnSessionStatus();
    setSessionStatus(status);
    return status;
  }

  async function checkSession() {
    setBusyAction('checking-session');
    setNotice(null);
    try {
      const status = await refreshStatus();
      setNotice(
        status.isSignedIn
          ? {
              tone: 'success',
              title: 'ESPN session ready',
              message: 'Both required ESPN session credentials were detected locally. You can import now.'
            }
          : {
              tone: 'info',
              title: 'Sign-in not detected yet',
              message: 'Finish signing in within the ESPN window, then return here and check again.'
            }
      );
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction(null);
    }
  }

  async function persistSettings(next = settings) {
    const saved = await window.leagueSaga.saveSettings(next);
    setSettings(saved);
    return saved;
  }

  async function openEspn() {
    setBusyAction('opening-espn');
    setNotice(null);
    try {
      const saved = await persistSettings();
      await window.leagueSaga.openEspnLogin({ leagueId: saved.leagueId, season: saved.season });
      setStep('connect');
      setNotice({
        tone: 'info',
        title: 'ESPN opened in a separate window',
        message: 'Sign in there, then return to this window and choose “Check sign-in status.”'
      });
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction(null);
    }
  }

  async function importEspn() {
    setBusyAction('importing');
    setNotice(null);
    setUploadResult(null);
    try {
      const saved = await persistSettings();
      const result = await window.leagueSaga.importFromEspn({
        leagueId: saved.leagueId,
        season: saved.season,
        importSessionId: saved.importSessionId
      });
      setHistory(result.history);
      setIncludedCategories(DEFAULT_INCLUDED_CATEGORIES);
      setStep('preview');
      setNotice(
        result.warnings.length
          ? { tone: 'info', title: 'Import ready with notes', message: result.warnings.join(' ') }
          : {
              tone: 'success',
              title: 'League history ready to review',
              message: `${result.history.seasons.length} season${result.history.seasons.length === 1 ? '' : 's'} were normalized and validated locally.`
            }
      );
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction(null);
    }
  }

  async function importMock() {
    setBusyAction('mocking');
    setNotice(null);
    setUploadResult(null);
    try {
      const saved = await persistSettings();
      const result = await window.leagueSaga.createMockImport({
        leagueId: saved.leagueId || 'mock-league',
        season: saved.season,
        importSessionId: saved.importSessionId
      });
      setHistory(result.history);
      setIncludedCategories(DEFAULT_INCLUDED_CATEGORIES);
      setStep('preview');
      setNotice({
        tone: 'info',
        title: 'Development preview',
        message: 'Mock data was created locally. No request was made to ESPN.'
      });
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction(null);
    }
  }

  async function saveBundle() {
    if (!deliveryHistory) return;
    setBusyAction('saving');
    setNotice(null);
    try {
      const result = await window.leagueSaga.saveBundleToDisk(deliveryHistory);
      if (!result.canceled) {
        setNotice({
          tone: 'success',
          title: 'JSON saved locally',
          message: result.filePath ?? 'Your historical import package was saved.'
        });
      }
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction(null);
    }
  }

  async function upload() {
    if (!deliveryHistory) return;
    if (!canUpload) {
      setNotice({
        tone: 'info',
        title: 'Open this helper from LeagueSaga to send data',
        message: 'This manual session can save JSON locally, but it does not include a secure LeagueSaga upload token.'
      });
      return;
    }
    setBusyAction('uploading');
    setNotice(null);
    try {
      const saved = await persistSettings();
      const result = await window.leagueSaga.uploadBundle({
        apiBaseUrl: saved.apiBaseUrl,
        importToken: saved.importToken,
        bundle: deliveryHistory
      });
      setUploadResult(result);
      setStep('upload');
      setNotice(null);
      if (result.ok || result.code === 'expired' || result.code === 'unauthorized') {
        deepLinkSettingsRef.current = deepLinkSettingsRef.current
          ? { ...deepLinkSettingsRef.current, importToken: '', importSessionId: undefined }
          : null;
        setSettings((current) => ({ ...current, importToken: '', importSessionId: undefined }));
      }
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction(null);
    }
  }

  async function cancelBusyAction() {
    try {
      if (busyAction === 'importing') await window.leagueSaga.cancelEspnImport();
      if (busyAction === 'uploading') await window.leagueSaga.cancelUpload();
    } catch (error) {
      showError(error);
    }
  }

  async function continueInLeagueSaga() {
    try {
      if (uploadResult?.continuationUrl) await window.leagueSaga.openLeagueSagaUrl(uploadResult.continuationUrl);
    } catch (error) {
      showError(error);
    }
  }

  async function checkForUpdates() {
    setUpdateBusy('checking');
    try {
      const next = await window.leagueSaga.checkForUpdates();
      setUpdateInfo(next);
    } catch (error) {
      showError(error);
    } finally {
      setUpdateBusy(null);
    }
  }

  async function downloadAndInstallUpdate() {
    setUpdateBusy('downloading');
    try {
      await window.leagueSaga.downloadUpdate();
      await window.leagueSaga.installUpdate();
    } catch (error) {
      showError(error);
      setUpdateBusy(null);
    }
  }

  async function openReleaseNotes() {
    try {
      if (updateInfo?.releaseUrl) await window.leagueSaga.openUpdateUrl(updateInfo.releaseUrl);
    } catch (error) {
      showError(error);
    }
  }

  async function saveDiagnostics() {
    try {
      const result = await window.leagueSaga.saveDiagnostics();
      if (!result.canceled) {
        setNotice({
          tone: 'success',
          title: 'Diagnostics saved',
          message:
            'The privacy-safe support log contains event names and counts, never cookies, tokens, headers, or raw payloads.'
        });
      }
    } catch (error) {
      showError(error);
    }
  }

  async function openProjectDocument(url: string) {
    try {
      await window.leagueSaga.openProjectUrl(url);
    } catch (error) {
      showError(error);
    }
  }

  async function clearSession() {
    setBusyAction('clearing-session');
    setNotice(null);
    try {
      await window.leagueSaga.clearEspnSession();
      await refreshStatus();
      setNotice({
        tone: 'success',
        title: 'ESPN session cleared',
        message: 'The helper removed its locally stored ESPN session.'
      });
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction(null);
    }
  }

  function showError(error: unknown) {
    setNotice({ tone: 'error', title: 'Something needs attention', message: formatError(error) });
  }

  function goToStep(nextStep: Step) {
    const canOpen =
      nextStep === 'provider' ||
      nextStep === 'details' ||
      (nextStep === 'connect' && detailsAreValid) ||
      ((nextStep === 'preview' || nextStep === 'upload') && Boolean(history));
    if (canOpen) {
      setStep(nextStep);
      setNotice(null);
    }
  }

  function chooseProvider(provider: ImportSourceProvider) {
    setSettings((current) =>
      current.provider === provider ? current : { ...current, provider, leagueId: '', season: undefined }
    );
    setSessionStatus(DEFAULT_STATUS);
    setHistory(null);
    setUploadResult(null);
    setStep('details');
    setNotice(null);
  }

  return (
    <main className="shell">
      <header className="app-header">
        <div className="brand-lockup">
          <img className="brand-logo" src={leagueSagaLogoUrl} alt="" />
          <img className="brand-wordmark" src={leagueSagaWordmarkUrl} alt="LeagueSaga" />
          <span className="brand-divider" aria-hidden="true" />
          <h1>Import Helper</h1>
        </div>
        <button className="settings-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
          <Icon name="gear" /> <span>Settings</span>
          {updateInfo?.status === 'available' && <span className="update-dot" aria-label="Update available" />}
        </button>
      </header>

      <section className="intro">
        <div>
          <h2>Bring your league into LeagueSaga.</h2>
          <p>Sign in directly to your league, review your league data, then choose what leaves your computer.</p>
        </div>
        <div className="privacy-points" aria-label="Privacy protections">
          <span>
            <Icon name="lock" /> Credentials stay local
          </span>
          <span>
            <Icon name="check" /> Review before sending
          </span>
        </div>
      </section>

      <section className="panel layout">
        <aside className="steps" aria-label="Import progress">
          <div className="steps-heading">
            <p className="eyebrow">Import progress</p>
            <span>
              Step {stepIndex + 1} of {STEPS.length}
            </span>
          </div>
          <nav>
            <StepButton
              state={step === 'provider' ? 'active' : stepIndex > 0 ? 'complete' : 'available'}
              number="1"
              title="Choose provider"
              body="ESPN, Yahoo, or Sleeper"
              onClick={() => goToStep('provider')}
            />
            <StepButton
              state={step === 'details' ? 'active' : stepIndex > 1 ? 'complete' : 'available'}
              number="2"
              title="League details"
              body="League and optional start year"
              onClick={() => goToStep('details')}
            />
            <StepButton
              state={
                step === 'connect' ? 'active' : stepIndex > 2 ? 'complete' : detailsAreValid ? 'available' : 'locked'
              }
              number="3"
              title={`Connect ${providerName(settings.provider)}`}
              body="Connect securely"
              onClick={() => goToStep('connect')}
            />
            <StepButton
              state={step === 'preview' ? 'active' : stepIndex > 3 ? 'complete' : history ? 'available' : 'locked'}
              number="4"
              title="Review data"
              body="Inspect every season"
              onClick={() => goToStep('preview')}
            />
            <StepButton
              state={step === 'upload' ? 'active' : history ? 'available' : 'locked'}
              number="5"
              title="Finish"
              body="Save or send to LeagueSaga"
              onClick={() => goToStep('upload')}
            />
          </nav>
          <div className="privacy-note">
            <Icon name="shield" />
            <div>
              <strong>Your provider password never enters LeagueSaga.</strong>
              <span>Authentication happens only in this helper.</span>
            </div>
          </div>
        </aside>

        <div className="content" ref={contentRef}>
          {notice && <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />}
          {step === 'provider' && <ProviderStep selectedProvider={settings.provider} onSelect={chooseProvider} />}
          {step === 'details' && (
            <LeagueDetailsStep
              settings={settings}
              setSettings={setSettings}
              busyAction={busyAction}
              canContinue={detailsAreValid}
              leagueIdIsValid={leagueIdIsValid}
              seasonIsValid={seasonIsValid}
              hasImportSession={canUpload}
              mockImportsEnabled={runtimeConfig.mockImportsEnabled}
              onContinue={() => goToStep('connect')}
              onMock={importMock}
            />
          )}
          {step === 'connect' && (
            <ConnectStep
              settings={settings}
              status={sessionStatus}
              busyAction={busyAction}
              canImport={canImport}
              onOpenEspn={openEspn}
              onRefresh={checkSession}
              onClear={clearSession}
              onImport={importEspn}
              onCancel={cancelBusyAction}
              onMock={importMock}
              mockImportsEnabled={runtimeConfig.mockImportsEnabled}
            />
          )}
          {step === 'preview' && (
            <PreviewStep
              sourceHistory={history}
              history={deliveryHistory}
              includedCategories={includedCategories}
              setIncludedCategories={setIncludedCategories}
              busyAction={busyAction}
              canUpload={canUpload}
              mockImportsEnabled={runtimeConfig.mockImportsEnabled}
              onSave={saveBundle}
              onUpload={upload}
              onCancel={cancelBusyAction}
            />
          )}
          {step === 'upload' && (
            <UploadStep
              history={deliveryHistory}
              result={uploadResult}
              busyAction={busyAction}
              canUpload={canUpload}
              mockImportsEnabled={runtimeConfig.mockImportsEnabled}
              onSave={saveBundle}
              onUpload={upload}
              onCancel={cancelBusyAction}
              onContinue={continueInLeagueSaga}
            />
          )}
        </div>
      </section>
      <footer className="app-footer">
        <span>Open source · Provider credentials stay in the helper session</span>
        <div>
          <button
            onClick={() =>
              void openProjectDocument(
                'https://github.com/dcuellar322/league-saga-import-helper/blob/master/docs/PRIVACY.md'
              )
            }
          >
            Privacy
          </button>
          <button
            onClick={() =>
              void openProjectDocument(
                'https://github.com/dcuellar322/league-saga-import-helper/blob/master/docs/SECURITY.md'
              )
            }
          >
            Security
          </button>
        </div>
      </footer>
      {settingsOpen && (
        <SettingsModal
          version={version}
          updateInfo={updateInfo}
          updateBusy={updateBusy}
          onClose={() => setSettingsOpen(false)}
          onCheckForUpdates={() => void checkForUpdates()}
          onDownloadAndInstall={() => void downloadAndInstallUpdate()}
          onOpenRelease={() => void openReleaseNotes()}
          onSaveDiagnostics={() => void saveDiagnostics()}
        />
      )}
    </main>
  );
}
