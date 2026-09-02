import { useEffect, useMemo, useRef, useState } from 'react';
import type { LeagueSagaImportBundle } from '@leaguesaga/import-contract';
import type {
  DeepLinkSettings,
  HelperSettings,
  RuntimeConfig,
  SessionStatus,
  UpdateInfo,
  UploadResult
} from '../shared/ipc';
import { currentSeasonYear, defaultLeagueSagaApiBaseUrl } from '../shared/environment';
import leagueSagaLogoUrl from '../../assets/league-saga-mark.png';
import { createDeliveryBundle, DEFAULT_INCLUDED_CATEGORIES, type IncludedCategories } from './import-review';
import { formatError } from './errors';
import {
  Icon,
  NoticeBanner,
  PreviewStep,
  SetupStep,
  SignInStep,
  StepButton,
  UploadStep,
  type BusyAction,
  type Notice
} from './components';

type Step = 'setup' | 'signin' | 'preview' | 'upload';

const STEPS: Step[] = ['setup', 'signin', 'preview', 'upload'];

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
  leagueId: '',
  season: currentSeasonYear()
};

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  apiBaseUrl: DEFAULT_SETTINGS.apiBaseUrl,
  isDevelopment: false,
  mockImportsEnabled: false
};

export default function App() {
  const [version, setVersion] = useState('');
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(DEFAULT_RUNTIME_CONFIG);
  const [step, setStep] = useState<Step>('setup');
  const [settings, setSettings] = useState<HelperSettings>(DEFAULT_SETTINGS);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(DEFAULT_STATUS);
  const [bundle, setBundle] = useState<LeagueSagaImportBundle | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [includedCategories, setIncludedCategories] = useState<IncludedCategories>(DEFAULT_INCLUDED_CATEGORIES);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const deepLinkSettingsRef = useRef<DeepLinkSettings | null>(null);

  useEffect(() => {
    let disposed = false;

    function withSeasonFallback(next: HelperSettings): HelperSettings {
      return { ...next, season: next.season ?? currentSeasonYear() };
    }

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
      deepLinkSettingsRef.current = { ...(deepLinkSettingsRef.current ?? {}), ...parsed };
      setSettings((current) => withSeasonFallback({ ...current, ...parsed }));
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
        setSettings(withSeasonFallback(deepLinkSettings ? { ...loaded, ...deepLinkSettings } : loaded));
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
    if (step !== 'signin' || sessionStatus.isSignedIn || busyAction === 'clearing-session') return;
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
  }, [step, sessionStatus.isSignedIn, busyAction]);

  const seasonIsValid = useMemo(
    () =>
      settings.season !== undefined &&
      Number.isInteger(settings.season) &&
      settings.season >= 2000 &&
      settings.season <= 2100,
    [settings.season]
  );
  const leagueIdIsValid = /^\d{1,12}$/.test(settings.leagueId.trim());
  const canImport = leagueIdIsValid && seasonIsValid;
  const canUpload = Boolean(settings.importToken.trim());
  const deliveryBundle = useMemo(
    () => (bundle ? createDeliveryBundle(bundle, includedCategories) : null),
    [bundle, includedCategories]
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
      setStep('signin');
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
      setBundle(result.bundle);
      setIncludedCategories(DEFAULT_INCLUDED_CATEGORIES);
      setStep('preview');
      setNotice(
        result.warnings.length
          ? { tone: 'info', title: 'Import ready with notes', message: result.warnings.join(' ') }
          : {
              tone: 'success',
              title: 'Import ready to review',
              message: 'Your ESPN data was normalized and validated locally.'
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
        season: saved.season ?? currentSeasonYear(),
        importSessionId: saved.importSessionId
      });
      setBundle(result.bundle);
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
    if (!deliveryBundle) return;
    setBusyAction('saving');
    setNotice(null);
    try {
      const result = await window.leagueSaga.saveBundleToDisk(deliveryBundle);
      if (!result.canceled) {
        setNotice({
          tone: 'success',
          title: 'JSON saved locally',
          message: result.filePath ?? 'Your import bundle was saved.'
        });
      }
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction(null);
    }
  }

  async function upload() {
    if (!deliveryBundle) return;
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
        bundle: deliveryBundle
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

  async function handleUpdateAction() {
    try {
      if (updateInfo?.status === 'available' && updateInfo.releaseUrl) {
        await window.leagueSaga.openUpdateUrl(updateInfo.releaseUrl);
        return;
      }
      const next = await window.leagueSaga.checkForUpdates();
      setUpdateInfo(next);
      setNotice(
        next.status === 'available'
          ? {
              tone: 'info',
              title: `Version ${next.latestVersion} is available`,
              message: 'Choose “Update available” in the header to open the signed release.'
            }
          : next.status === 'current'
            ? {
                tone: 'success',
                title: 'Helper is up to date',
                message: `Version ${next.currentVersion} is the latest available release.`
              }
            : {
                tone: 'info',
                title: 'Update check unavailable',
                message: 'The helper could not reach the release service. Try again later.'
              }
      );
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
    const nextIndex = STEPS.indexOf(nextStep);
    if (nextIndex <= 1 || bundle) {
      setStep(nextStep);
      setNotice(null);
    }
  }

  return (
    <main className="shell">
      <header className="app-header">
        <div className="brand-lockup">
          <img className="brand-logo" src={leagueSagaLogoUrl} alt="" />
          <div>
            <p className="eyebrow">LeagueSaga</p>
            <h1>ESPN Import Helper</h1>
          </div>
        </div>
        <div className="header-tools">
          <button className="header-action" onClick={saveDiagnostics}>
            Save diagnostics
          </button>
          <button
            className={`secure-badge ${updateInfo?.status === 'available' ? 'update' : ''}`}
            onClick={handleUpdateAction}
          >
            <Icon name="shield" />{' '}
            {updateInfo?.status === 'available'
              ? `Update ${updateInfo.latestVersion} available`
              : `Secure local helper ${version ? `· v${version}` : ''}`}
          </button>
        </div>
      </header>

      <section className="intro">
        <div>
          <h2>Bring your ESPN league into LeagueSaga.</h2>
          <p>Sign in directly with ESPN, review the normalized data, then choose exactly what leaves your computer.</p>
        </div>
        <div className="privacy-points" aria-label="Privacy protections">
          <span>
            <Icon name="lock" /> Cookies stay local
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
              state={step === 'setup' ? 'active' : stepIndex > 0 ? 'complete' : 'available'}
              number="1"
              title="League details"
              body="Choose league and season"
              onClick={() => goToStep('setup')}
            />
            <StepButton
              state={step === 'signin' ? 'active' : stepIndex > 1 ? 'complete' : canImport ? 'available' : 'locked'}
              number="2"
              title="Connect ESPN"
              body="Sign in securely"
              onClick={() => goToStep('signin')}
            />
            <StepButton
              state={step === 'preview' ? 'active' : stepIndex > 2 ? 'complete' : bundle ? 'available' : 'locked'}
              number="3"
              title="Review data"
              body="Inspect the local bundle"
              onClick={() => goToStep('preview')}
            />
            <StepButton
              state={step === 'upload' ? 'active' : bundle ? 'available' : 'locked'}
              number="4"
              title="Finish"
              body="Save or send to LeagueSaga"
              onClick={() => goToStep('upload')}
            />
          </nav>
          <div className="privacy-note">
            <Icon name="shield" />
            <div>
              <strong>Your ESPN password never enters LeagueSaga.</strong>
              <span>Authentication happens only in this helper.</span>
            </div>
          </div>
        </aside>

        <div className="content">
          {notice && <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />}
          {step === 'setup' && (
            <SetupStep
              settings={settings}
              setSettings={setSettings}
              busyAction={busyAction}
              canContinue={canImport}
              leagueIdIsValid={leagueIdIsValid}
              seasonIsValid={seasonIsValid}
              hasImportSession={canUpload}
              mockImportsEnabled={runtimeConfig.mockImportsEnabled}
              onContinue={() => goToStep('signin')}
              onMock={importMock}
            />
          )}
          {step === 'signin' && (
            <SignInStep
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
              sourceBundle={bundle}
              bundle={deliveryBundle}
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
              bundle={deliveryBundle}
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
        <span>Open source · ESPN credentials stay in the helper session</span>
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
    </main>
  );
}
