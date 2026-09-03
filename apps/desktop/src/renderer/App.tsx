import { useEffect, useRef } from 'react';
import leagueSagaLogoUrl from '../../assets/league-saga-mark.png';
import leagueSagaWordmarkUrl from '../../assets/league-saga-wordmark-reverse.svg';
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
  providerName
} from './components';
import { IMPORT_STEPS } from './import-workflow-state';
import { useHelperShell } from './use-helper-shell';
import { useImportWorkflow } from './use-import-workflow';

export default function App() {
  const workflow = useImportWorkflow();
  const shell = useHelperShell({ showError: workflow.showError, setNotice: workflow.setNotice });
  const contentRef = useRef<HTMLDivElement>(null);
  const stepIndex = IMPORT_STEPS.indexOf(workflow.step);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [workflow.step]);

  return (
    <main
      className="shell"
      data-api-base-url={workflow.settings.apiBaseUrl}
      data-import-token-present={workflow.canUpload}
      data-import-session-id={workflow.settings.importSessionId ?? ''}
    >
      <header className="app-header">
        <div className="brand-lockup">
          <img className="brand-logo" src={leagueSagaLogoUrl} alt="" />
          <img className="brand-wordmark" src={leagueSagaWordmarkUrl} alt="LeagueSaga" />
          <span className="brand-divider" aria-hidden="true" />
          <h1>Import Helper</h1>
        </div>
        <button className="settings-button" onClick={() => shell.setSettingsOpen(true)} aria-label="Open settings">
          <Icon name="gear" /> <span>Settings</span>
          {shell.updateInfo?.status === 'available' && <span className="update-dot" aria-label="Update available" />}
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
              Step {stepIndex + 1} of {IMPORT_STEPS.length}
            </span>
          </div>
          <nav>
            <StepButton
              state={workflow.step === 'provider' ? 'active' : stepIndex > 0 ? 'complete' : 'available'}
              number="1"
              title="Choose provider"
              body="ESPN, Yahoo, or Sleeper"
              onClick={() => workflow.goToStep('provider')}
            />
            <StepButton
              state={workflow.step === 'details' ? 'active' : stepIndex > 1 ? 'complete' : 'available'}
              number="2"
              title="League details"
              body="League and optional start year"
              onClick={() => workflow.goToStep('details')}
            />
            <StepButton
              state={
                workflow.step === 'connect'
                  ? 'active'
                  : stepIndex > 2
                    ? 'complete'
                    : workflow.detailsAreValid
                      ? 'available'
                      : 'locked'
              }
              number="3"
              title={`Connect ${providerName(workflow.settings.provider)}`}
              body="Connect securely"
              onClick={() => workflow.goToStep('connect')}
            />
            <StepButton
              state={
                workflow.step === 'preview'
                  ? 'active'
                  : stepIndex > 3
                    ? 'complete'
                    : workflow.history
                      ? 'available'
                      : 'locked'
              }
              number="4"
              title="Review data"
              body="Inspect every season"
              onClick={() => workflow.goToStep('preview')}
            />
            <StepButton
              state={workflow.step === 'upload' ? 'active' : workflow.history ? 'available' : 'locked'}
              number="5"
              title="Finish"
              body="Save or send to LeagueSaga"
              onClick={() => workflow.goToStep('upload')}
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
          {workflow.notice && <NoticeBanner notice={workflow.notice} onDismiss={() => workflow.setNotice(null)} />}
          {workflow.step === 'provider' && (
            <ProviderStep selectedProvider={workflow.settings.provider} onSelect={workflow.chooseProvider} />
          )}
          {workflow.step === 'details' && (
            <LeagueDetailsStep
              settings={workflow.settings}
              setSettings={workflow.setSettings}
              busyAction={workflow.busyAction}
              canContinue={workflow.detailsAreValid}
              leagueIdIsValid={workflow.leagueIdIsValid}
              seasonIsValid={workflow.seasonIsValid}
              hasImportSession={workflow.canUpload}
              mockImportsEnabled={workflow.runtimeConfig.mockImportsEnabled}
              onContinue={() => workflow.goToStep('connect')}
              onMock={workflow.importMock}
            />
          )}
          {workflow.step === 'connect' && (
            <ConnectStep
              settings={workflow.settings}
              status={workflow.sessionStatus}
              busyAction={workflow.busyAction}
              canImport={workflow.canImport}
              onOpenEspn={workflow.openEspn}
              onRefresh={workflow.checkSession}
              onClear={workflow.clearSession}
              onImport={workflow.importEspn}
              onCancel={workflow.cancelBusyAction}
              onMock={workflow.importMock}
              mockImportsEnabled={workflow.runtimeConfig.mockImportsEnabled}
            />
          )}
          {workflow.step === 'preview' && (
            <PreviewStep
              sourceHistory={workflow.history}
              history={workflow.deliveryHistory}
              includedCategories={workflow.includedCategories}
              setIncludedCategories={workflow.setIncludedCategories}
              busyAction={workflow.busyAction}
              canUpload={workflow.canUpload}
              mockImportsEnabled={workflow.runtimeConfig.mockImportsEnabled}
              onSave={workflow.saveBundle}
              onUpload={workflow.upload}
              onCancel={workflow.cancelBusyAction}
            />
          )}
          {workflow.step === 'upload' && (
            <UploadStep
              history={workflow.deliveryHistory}
              result={workflow.uploadResult}
              busyAction={workflow.busyAction}
              canUpload={workflow.canUpload}
              mockImportsEnabled={workflow.runtimeConfig.mockImportsEnabled}
              onSave={workflow.saveBundle}
              onUpload={workflow.upload}
              onCancel={workflow.cancelBusyAction}
              onContinue={workflow.continueInLeagueSaga}
            />
          )}
        </div>
      </section>
      <footer className="app-footer">
        <span>Open source · Provider credentials stay in the helper session</span>
        <div>
          <button
            onClick={() =>
              void shell.openProjectDocument(
                'https://github.com/dcuellar322/league-saga-import-helper/blob/master/docs/PRIVACY.md'
              )
            }
          >
            Privacy
          </button>
          <button
            onClick={() =>
              void shell.openProjectDocument(
                'https://github.com/dcuellar322/league-saga-import-helper/blob/master/docs/SECURITY.md'
              )
            }
          >
            Security
          </button>
        </div>
      </footer>
      {shell.settingsOpen && (
        <SettingsModal
          version={shell.version}
          updateInfo={shell.updateInfo}
          updateBusy={shell.updateBusy}
          onClose={() => shell.setSettingsOpen(false)}
          onCheckForUpdates={() => void shell.checkForUpdates()}
          onDownloadAndInstall={() => void shell.downloadAndInstallUpdate()}
          onOpenRelease={() => void shell.openReleaseNotes()}
          onSaveDiagnostics={() => void shell.saveDiagnostics()}
        />
      )}
    </main>
  );
}
