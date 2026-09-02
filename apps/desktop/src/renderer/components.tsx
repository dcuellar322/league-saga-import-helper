import { useState, type ClipboardEvent, type ReactNode } from 'react';
import type { LeagueSagaHistoryImport } from '@leaguesaga/import-contract';
import type { HelperSettings, ImportSourceProvider, SessionStatus, UpdateInfo, UploadResult } from '../shared/ipc';
import { parseEspnLeagueInput } from '../shared/espn-input';
import { currentSeasonYear } from '../shared/environment';
import type { IncludedCategories, OptionalImportCategory } from './import-review';

export type BusyAction =
  'opening-espn' | 'checking-session' | 'clearing-session' | 'importing' | 'mocking' | 'saving' | 'uploading';

export type Notice = {
  tone: 'info' | 'success' | 'error';
  title: string;
  message: string;
};

export type UpdateBusy = 'checking' | 'downloading' | null;

type IconName =
  | 'arrow'
  | 'calendar'
  | 'check'
  | 'chevron'
  | 'copy'
  | 'download'
  | 'external'
  | 'file'
  | 'gear'
  | 'link'
  | 'lock'
  | 'refresh'
  | 'shield'
  | 'upload';

const PROVIDERS: Array<{
  id: ImportSourceProvider;
  name: string;
  mark: string;
  description: string;
  availability: string;
}> = [
  {
    id: 'espn',
    name: 'ESPN',
    mark: 'ESPN',
    description: 'Import public or private leagues through a secure local session.',
    availability: 'Available now'
  },
  {
    id: 'yahoo',
    name: 'Yahoo',
    mark: 'Y!',
    description: 'Connect a Yahoo account, choose a league, and import its history.',
    availability: 'Adapter coming soon'
  },
  {
    id: 'sleeper',
    name: 'Sleeper',
    mark: 'S',
    description: 'Find a public league and bring its linked seasons into LeagueSaga.',
    availability: 'Adapter coming soon'
  }
];

export function providerName(provider: ImportSourceProvider): string {
  return PROVIDERS.find((item) => item.id === provider)?.name ?? 'League provider';
}

export function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  return (
    <div className={`notice ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
      <span className="notice-icon">
        <Icon name={notice.tone === 'success' ? 'check' : notice.tone === 'error' ? 'external' : 'shield'} />
      </span>
      <div>
        <strong>{notice.title}</strong>
        <p>{notice.message}</p>
      </div>
      <button className="icon-button" aria-label="Dismiss message" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}

export function StepButton({
  state,
  number,
  title,
  body,
  onClick
}: {
  state: 'active' | 'complete' | 'available' | 'locked';
  number: string;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`step-button ${state}`}
      onClick={onClick}
      disabled={state === 'locked'}
      aria-current={state === 'active' ? 'step' : undefined}
    >
      <span className="step-number">{state === 'complete' ? <Icon name="check" /> : number}</span>
      <strong>{title}</strong>
      <small>{body}</small>
      <Icon name="chevron" />
    </button>
  );
}

export function ProviderStep({
  selectedProvider,
  onSelect
}: {
  selectedProvider: ImportSourceProvider;
  onSelect: (provider: ImportSourceProvider) => void;
}) {
  return (
    <section className="step-content provider-step">
      <StepHeader
        kicker="Step 1"
        title="Where does your league live?"
        body="Choose your fantasy provider. The helper will tailor the league details and connection experience to it."
      />
      <div className="provider-grid" aria-label="Fantasy league providers">
        {PROVIDERS.map((provider) => {
          const available = provider.id === 'espn';
          return (
            <button
              type="button"
              className={`provider-card ${provider.id} ${selectedProvider === provider.id ? 'selected' : ''}`}
              key={provider.id}
              onClick={() => onSelect(provider.id)}
              aria-pressed={selectedProvider === provider.id}
            >
              <span className="provider-mark">{provider.mark}</span>
              <span className="provider-copy">
                <span className="provider-title-row">
                  <strong>{provider.name}</strong>
                  <small className={available ? 'available' : ''}>{provider.availability}</small>
                </span>
                <span>{provider.description}</span>
              </span>
              <Icon name="arrow" />
            </button>
          );
        })}
      </div>
      <div className="provider-note">
        <Icon name="shield" />
        <div>
          <strong>Provider credentials stay in this helper.</strong>
          <span>You always review the normalized league data before anything is saved or sent.</span>
        </div>
      </div>
    </section>
  );
}

export function LeagueDetailsStep({
  settings,
  setSettings,
  busyAction,
  canContinue,
  leagueIdIsValid,
  seasonIsValid,
  hasImportSession,
  mockImportsEnabled,
  onContinue,
  onMock
}: {
  settings: HelperSettings;
  setSettings: (settings: HelperSettings) => void;
  busyAction: BusyAction | null;
  canContinue: boolean;
  leagueIdIsValid: boolean;
  seasonIsValid: boolean;
  hasImportSession: boolean;
  mockImportsEnabled: boolean;
  onContinue: () => void;
  onMock: () => void;
}) {
  const provider = providerName(settings.provider);
  const providerSlug =
    settings.provider === 'espn'
      ? 'fantasy.espn.com'
      : settings.provider === 'yahoo'
        ? 'football.fantasysports.yahoo.com'
        : 'sleeper.com';
  const example =
    settings.provider === 'espn'
      ? 'https://fantasy.espn.com/football/league?leagueId=123456'
      : settings.provider === 'yahoo'
        ? 'https://football.fantasysports.yahoo.com/f1/123456'
        : 'https://sleeper.com/leagues/123456789012345678';

  function updateSeason(value: string) {
    setSettings({ ...settings, season: value.trim() ? Number(value) : undefined });
  }

  function pasteLeagueUrl(event: ClipboardEvent<HTMLInputElement>) {
    const parsed = parseEspnLeagueInput(event.clipboardData.getData('text'));
    if (!parsed) return;
    event.preventDefault();
    setSettings({ ...settings, leagueId: parsed.leagueId, season: parsed.season ?? settings.season });
  }

  return (
    <section className="step-content">
      <StepHeader
        kicker="Step 2"
        title="League details"
        body={`Enter the ${provider} league you want to bring into LeagueSaga. You can paste its full URL or use its league ID.`}
      />
      <div className="details-layout">
        <div className="details-form">
          <div className={`connection-card ${hasImportSession ? 'connected' : ''}`}>
            <span className="connection-icon">
              <Icon name={hasImportSession ? 'check' : 'external'} />
            </span>
            <div>
              <strong>{hasImportSession ? 'LeagueSaga session connected' : 'Manual setup'}</strong>
              <p>
                {hasImportSession
                  ? 'A secure, one-time upload session was provided by LeagueSaga.'
                  : 'You can create and save an import locally. Open the helper from LeagueSaga when you are ready to send it.'}
              </p>
            </div>
          </div>
          <div className="form-stack">
            <Field
              label={`${provider} league URL or League ID`}
              hint={`Paste the complete ${provider} URL or enter its league ID.`}
              error={
                settings.leagueId && !leagueIdIsValid ? `Enter a valid ${provider} league URL or league ID.` : undefined
              }
            >
              <div className="input-with-icon">
                <Icon name="link" />
                <input
                  value={settings.leagueId}
                  onPaste={settings.provider === 'espn' ? pasteLeagueUrl : undefined}
                  onChange={(event) => setSettings({ ...settings, leagueId: event.target.value.trim() })}
                  placeholder={`Paste ${provider} URL or League ID`}
                  autoComplete="off"
                  inputMode={settings.provider === 'espn' || settings.provider === 'sleeper' ? 'numeric' : 'text'}
                  aria-invalid={Boolean(settings.leagueId && !leagueIdIsValid)}
                />
              </div>
            </Field>
            <Field
              label="Season start year (optional)"
              hint="Leave blank to import every linked season, or choose the first season to include."
              error={
                !seasonIsValid
                  ? `Enter a year from 2000 to ${currentSeasonYear()}, or leave it blank for all history.`
                  : undefined
              }
            >
              <div className="input-with-icon">
                <Icon name="calendar" />
                <input
                  type="number"
                  inputMode="numeric"
                  min="2000"
                  max={currentSeasonYear()}
                  value={settings.season ?? ''}
                  onChange={(event) => updateSeason(event.target.value)}
                  placeholder="Select start year"
                  aria-invalid={!seasonIsValid}
                />
              </div>
            </Field>
          </div>
          <div className="actions step-actions">
            <button className="primary" disabled={Boolean(busyAction) || !canContinue} onClick={onContinue}>
              Continue <Icon name="arrow" />
            </button>
            {mockImportsEnabled && (
              <button className="text-button" disabled={Boolean(busyAction)} onClick={onMock}>
                {busyAction === 'mocking' ? 'Creating preview…' : 'Use development data'}
              </button>
            )}
          </div>
        </div>
        <aside className="example-card">
          <div className="example-heading">
            <span>
              <Icon name="link" />
            </span>
            <div>
              <strong>Find your {provider} league</strong>
              <small>{providerSlug}</small>
            </div>
          </div>
          <p className="fastest-path">
            <Icon name="arrow" /> Fastest path
          </p>
          <p>
            Open your league in a browser and paste the page URL. The helper will extract the league ID when supported.
          </p>
          <div className="example-divider" />
          <small>Example</small>
          <code>{example}</code>
          <p className="example-id">
            <strong>League ID:</strong> 123456
          </p>
          <div className="example-divider" />
          <p className="privacy-line">
            <Icon name="shield" /> Your league stays private
          </p>
          <p>Only the reviewed historical import package can leave this computer.</p>
        </aside>
      </div>
    </section>
  );
}

export function ConnectStep({
  settings,
  status,
  busyAction,
  canImport,
  onOpenEspn,
  onRefresh,
  onClear,
  onImport,
  onCancel,
  onMock,
  mockImportsEnabled
}: {
  settings: HelperSettings;
  status: SessionStatus;
  busyAction: BusyAction | null;
  canImport: boolean;
  onOpenEspn: () => void;
  onRefresh: () => void;
  onClear: () => void;
  onImport: () => void;
  onCancel: () => void;
  onMock: () => void;
  mockImportsEnabled: boolean;
}) {
  const busy = Boolean(busyAction);
  const provider = providerName(settings.provider);
  const historyRange = settings.season ? `from ${settings.season} forward` : 'for every linked season';

  if (settings.provider !== 'espn') {
    return (
      <section className="step-content">
        <StepHeader
          kicker="Step 3"
          title={`Connect to ${provider}`}
          body={`The wizard now carries ${provider} context through every step, but this release does not include the ${provider} data adapter yet.`}
        />
        <div className={`provider-unavailable ${settings.provider}`}>
          <span className="provider-mark">{settings.provider === 'yahoo' ? 'Y!' : 'S'}</span>
          <div>
            <p className="eyebrow">Adapter coming soon</p>
            <h3>{provider} imports are not available in this build</h3>
            <p>
              A production connection needs provider-specific authentication, API fetching, normalization, and contract
              validation. This screen is ready for that adapter without pretending the import works today.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="step-content">
      <StepHeader
        kicker="Step 3"
        title="Connect to ESPN"
        body={`Sign in for league ${settings.leagueId} and import its history ${historyRange}. ESPN opens in a separate, isolated window.`}
      />
      <div className="instruction-row" aria-label="Sign-in instructions">
        <Instruction number="1" text="Open ESPN" />
        <Instruction number="2" text="Sign in there" />
        <Instruction number="3" text="Return and check status" />
      </div>
      <div className={`session-card ${status.isSignedIn ? 'ready' : ''}`}>
        <div className="session-heading">
          <span className="session-icon">
            <Icon name={status.isSignedIn ? 'check' : 'lock'} />
          </span>
          <div>
            <p className="eyebrow">ESPN connection</p>
            <h3>{status.isSignedIn ? 'Ready to import' : 'Waiting for sign-in'}</h3>
          </div>
          <span className={`status-pill ${status.isSignedIn ? 'good' : 'warn'}`}>
            {status.isSignedIn ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div className="credential-checks">
          <CredentialCheck label="ESPN identity" detected={status.hasSwid} />
          <CredentialCheck label="ESPN session" detected={status.hasEspnS2} />
        </div>
        <p className="session-detail">
          These credentials remain encrypted in the helper's isolated local session and are never uploaded.
        </p>
      </div>
      <div className="actions step-actions">
        {!status.isSignedIn ? (
          <>
            <button className="primary" disabled={busy || !canImport} onClick={onOpenEspn}>
              {busyAction === 'opening-espn' ? 'Opening ESPN…' : 'Open ESPN sign-in'} <Icon name="external" />
            </button>
            <button disabled={busy} onClick={onRefresh}>
              {busyAction === 'checking-session' ? 'Checking…' : 'Check sign-in status'} <Icon name="refresh" />
            </button>
          </>
        ) : (
          <>
            <button className="primary" disabled={busy || !canImport} onClick={onImport}>
              {busyAction === 'importing' ? 'Importing and validating history…' : 'Import ESPN history'}{' '}
              <Icon name="arrow" />
            </button>
            {busyAction === 'importing' && <button onClick={onCancel}>Cancel import</button>}
          </>
        )}
        <button className="text-button danger" disabled={busy} onClick={onClear}>
          {busyAction === 'clearing-session' ? 'Clearing…' : 'Clear local ESPN session'}
        </button>
      </div>
      {mockImportsEnabled && (
        <div className="developer-option">
          <span>Development mode</span>
          <button className="text-button" disabled={busy} onClick={onMock}>
            {busyAction === 'mocking' ? 'Creating…' : 'Preview with mock data'}
          </button>
        </div>
      )}
    </section>
  );
}

export function SettingsModal({
  version,
  updateInfo,
  updateBusy,
  onClose,
  onCheckForUpdates,
  onDownloadAndInstall,
  onOpenRelease,
  onSaveDiagnostics
}: {
  version: string;
  updateInfo: UpdateInfo | null;
  updateBusy: UpdateBusy;
  onClose: () => void;
  onCheckForUpdates: () => void;
  onDownloadAndInstall: () => void;
  onOpenRelease: () => void;
  onSaveDiagnostics: () => void;
}) {
  const status =
    updateBusy === 'checking'
      ? 'Checking the signed release channel…'
      : updateBusy === 'downloading'
        ? 'Downloading and verifying the update…'
        : updateInfo?.status === 'available'
          ? `Version ${updateInfo.latestVersion} is ready to download.`
          : updateInfo?.status === 'current'
            ? 'You are running the latest available version.'
            : updateInfo?.status === 'unavailable'
              ? 'The release service is unavailable. Try again later.'
              : 'Check the signed LeagueSaga release channel for a newer version.';

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header">
          <div>
            <p className="eyebrow">LeagueSaga Import Helper</p>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button className="icon-button modal-close" aria-label="Close settings" onClick={onClose} autoFocus>
            ×
          </button>
        </header>
        <div className="settings-section version-section">
          <span className="settings-section-icon">
            <Icon name="shield" />
          </span>
          <div>
            <span>Installed version</span>
            <strong>v{version || '0.0.0'}</strong>
          </div>
          <span className="local-badge">
            <Icon name="lock" /> Local helper
          </span>
        </div>
        <div className="settings-section update-section">
          <div className="settings-section-heading">
            <div>
              <h3>Software updates</h3>
              <p aria-live="polite">{status}</p>
            </div>
            <Icon name="refresh" />
          </div>
          <div className="actions">
            <button disabled={Boolean(updateBusy)} onClick={onCheckForUpdates}>
              {updateBusy === 'checking' ? 'Checking…' : 'Check for Updates'} <Icon name="refresh" />
            </button>
            {updateInfo?.status === 'available' && (
              <button className="primary" disabled={Boolean(updateBusy)} onClick={onDownloadAndInstall}>
                {updateBusy === 'downloading' ? 'Downloading…' : 'Download and restart'} <Icon name="download" />
              </button>
            )}
            {updateInfo?.status === 'available' && updateInfo.releaseUrl && (
              <button className="text-button" disabled={Boolean(updateBusy)} onClick={onOpenRelease}>
                View release notes <Icon name="external" />
              </button>
            )}
          </div>
        </div>
        <div className="settings-section diagnostics-section">
          <div>
            <h3>Diagnostics</h3>
            <p>Save a privacy-safe support log. It never includes cookies, tokens, headers, or raw league data.</p>
          </div>
          <button onClick={onSaveDiagnostics}>
            Save diagnostics <Icon name="download" />
          </button>
        </div>
      </section>
    </div>
  );
}

export function PreviewStep({
  sourceHistory,
  history,
  includedCategories,
  setIncludedCategories,
  busyAction,
  canUpload,
  mockImportsEnabled,
  onSave,
  onUpload,
  onCancel
}: {
  sourceHistory: LeagueSagaHistoryImport | null;
  history: LeagueSagaHistoryImport | null;
  includedCategories: IncludedCategories;
  setIncludedCategories: (value: IncludedCategories) => void;
  busyAction: BusyAction | null;
  canUpload: boolean;
  mockImportsEnabled: boolean;
  onSave: () => void;
  onUpload: () => void;
  onCancel: () => void;
}) {
  if (!history || !sourceHistory) {
    return (
      <EmptyState
        title="Nothing to review yet"
        body={
          mockImportsEnabled
            ? 'Connect to ESPN or use development data to create an import.'
            : 'Connect to ESPN to create an import first.'
        }
      />
    );
  }
  const busy = Boolean(busyAction);
  return (
    <section className="step-content">
      <StepHeader
        kicker="Step 4"
        title="Review your league history"
        body="Every season below was fetched and validated independently. Provider passwords and raw session credentials are never included."
      />
      <HistoryHero history={history} />
      <HistorySummary history={history} />
      <ReviewCategories sourceHistory={sourceHistory} included={includedCategories} onChange={setIncludedCategories} />
      <HumanReadablePreview history={history} />
      <div className="actions step-actions">
        <button disabled={busy} onClick={onSave}>
          {busyAction === 'saving' ? 'Saving…' : 'Save history JSON'} <Icon name="download" />
        </button>
        <button className="primary" disabled={busy || !canUpload} onClick={onUpload}>
          {busyAction === 'uploading' ? 'Sending securely…' : 'Send to LeagueSaga'} <Icon name="upload" />
        </button>
        {busyAction === 'uploading' && <button onClick={onCancel}>Cancel upload</button>}
      </div>
      {!canUpload && (
        <p className="action-note">
          <Icon name="lock" /> Sending is available when this helper is opened from LeagueSaga. Local export is always
          available.
        </p>
      )}
      <JsonPreview label="Inspect complete history JSON" value={history} />
    </section>
  );
}

export function UploadStep({
  history,
  result,
  busyAction,
  canUpload,
  mockImportsEnabled,
  onSave,
  onUpload,
  onCancel,
  onContinue
}: {
  history: LeagueSagaHistoryImport | null;
  result: UploadResult | null;
  busyAction: BusyAction | null;
  canUpload: boolean;
  mockImportsEnabled: boolean;
  onSave: () => void;
  onUpload: () => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  if (!history) {
    return (
      <EmptyState
        title="No import to finish"
        body={
          mockImportsEnabled
            ? 'Connect to ESPN or use development data first.'
            : 'Connect to ESPN and review an import first.'
        }
      />
    );
  }
  const busy = Boolean(busyAction);
  return (
    <section className="step-content">
      <StepHeader
        kicker="Step 5"
        title={result?.ok ? 'Import delivered' : 'Finish your import'}
        body={
          result?.ok
            ? 'LeagueSaga received the reviewed history package and will guide you through the final preview.'
            : 'Save a local copy or send the reviewed history package to LeagueSaga.'
        }
      />
      {result ? (
        <div className={`result-card ${result.ok ? 'good' : 'bad'}`}>
          <span className="result-icon">
            <Icon name={result.ok ? 'check' : 'external'} />
          </span>
          <div>
            <strong>{result.ok ? 'LeagueSaga received your data' : 'The upload did not complete'}</strong>
            <p>{result.message}</p>
          </div>
        </div>
      ) : (
        <HistoryHero history={history} compact />
      )}
      <div className="actions step-actions">
        <button disabled={busy} onClick={onSave}>
          {busyAction === 'saving' ? 'Saving…' : 'Save history JSON'} <Icon name="download" />
        </button>
        {result?.ok && result.continuationUrl ? (
          <button className="primary" disabled={busy} onClick={onContinue}>
            Continue in LeagueSaga <Icon name="external" />
          </button>
        ) : (
          !result?.ok && (
            <button className="primary" disabled={busy || !canUpload} onClick={onUpload}>
              {busyAction === 'uploading'
                ? 'Sending securely…'
                : result?.retryable
                  ? 'Retry upload'
                  : 'Send to LeagueSaga'}{' '}
              <Icon name="upload" />
            </button>
          )
        )}
        {busyAction === 'uploading' && <button onClick={onCancel}>Cancel upload</button>}
      </div>
      {result?.ok && !result.continuationUrl && (
        <p className="action-note">
          <Icon name="check" /> Return to the LeagueSaga browser tab to continue the preview.
        </p>
      )}
      {!result?.ok && !canUpload && (
        <p className="action-note">
          <Icon name="lock" /> Open this helper from LeagueSaga to enable secure sending.
        </p>
      )}
      {result?.response ? <JsonPreview label="View LeagueSaga response" value={result.response} /> : null}
    </section>
  );
}

function JsonPreview({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const json = JSON.stringify(value, null, 2) ?? 'null';

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }

  return (
    <section className={`json-preview ${open ? 'open' : ''}`}>
      <div className="json-preview-header">
        <button
          type="button"
          className="json-preview-toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <Icon name="file" /> <span>{label}</span> <Icon name="chevron" />
        </button>
        <button type="button" className="copy-json-button" onClick={() => void copyJson()} aria-live="polite">
          <Icon name={copyStatus === 'copied' ? 'check' : 'copy'} />
          {copyStatus === 'copied' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy JSON'}
        </button>
      </div>
      {open && <pre>{json}</pre>}
    </section>
  );
}

function ReviewCategories({
  sourceHistory,
  included,
  onChange
}: {
  sourceHistory: LeagueSagaHistoryImport;
  included: IncludedCategories;
  onChange: (value: IncludedCategories) => void;
}) {
  const categories: Array<{ key: OptionalImportCategory; label: string; count: number; description: string }> = [
    {
      key: 'rosterEntries',
      label: 'Rosters',
      count: sumHistory(sourceHistory, 'rosterEntries'),
      description: 'Players and lineup slots'
    },
    {
      key: 'matchups',
      label: 'Matchups',
      count: sumHistory(sourceHistory, 'matchups'),
      description: 'Scores, opponents, and winners'
    },
    {
      key: 'draftPicks',
      label: 'Draft',
      count: sumHistory(sourceHistory, 'draftPicks'),
      description: 'Picks, keepers, and auction prices'
    },
    {
      key: 'transactions',
      label: 'Transactions',
      count: sumHistory(sourceHistory, 'transactions'),
      description: 'Adds, drops, waivers, and trades'
    }
  ];
  return (
    <section className="review-options" aria-labelledby="review-options-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Choose what leaves this computer</p>
          <h3 id="review-options-title">Import categories</h3>
        </div>
        <span>League and teams are required</span>
      </div>
      <div className="review-option-grid">
        {categories.map((category) => (
          <label className={`review-option ${included[category.key] ? 'selected' : ''}`} key={category.key}>
            <input
              type="checkbox"
              checked={included[category.key]}
              onChange={() => onChange({ ...included, [category.key]: !included[category.key] })}
            />
            <span>
              <strong>{category.label}</strong>
              <small>
                {category.count} records · {category.description}
              </small>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function HumanReadablePreview({ history }: { history: LeagueSagaHistoryImport }) {
  return (
    <section className="readable-preview" aria-labelledby="readable-preview-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Human-readable review</p>
          <h3 id="readable-preview-title">Seasons that will be sent</h3>
        </div>
      </div>
      <div className="preview-sections">
        {history.seasons.map((bundle, index) => (
          <details key={bundle.league.season} open={index === history.seasons.length - 1}>
            <summary>
              Season {bundle.league.season} <span>{bundle.teams.length} teams</span>
            </summary>
            <ul>
              {bundle.teams.map((team) => (
                <li key={team.externalRef.externalId}>
                  <strong>{team.displayName}</strong>
                  <small>
                    {team.ownerDisplayNames.length
                      ? team.ownerDisplayNames.join(', ')
                      : 'No owner name returned by provider'}
                  </small>
                </li>
              ))}
            </ul>
            <p>
              {bundle.rosterEntries.length} roster entries · {bundle.matchups.length} matchups ·{' '}
              {bundle.draftPicks.length} draft picks · {bundle.transactions.length} transactions
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

function StepHeader({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <header className="step-header">
      <p className="eyebrow">{kicker}</p>
      <h2>{title}</h2>
      <p>{body}</p>
    </header>
  );
}

function Instruction({ number, text }: { number: string; text: string }) {
  return (
    <div className="instruction">
      <span>{number}</span>
      <strong>{text}</strong>
    </div>
  );
}

function CredentialCheck({ label, detected }: { label: string; detected: boolean }) {
  return (
    <div className={detected ? 'detected' : ''}>
      <span>
        <Icon name={detected ? 'check' : 'lock'} />
      </span>
      <strong>{label}</strong>
      <small>{detected ? 'Detected locally' : 'Waiting'}</small>
    </div>
  );
}

function HistoryHero({ history, compact = false }: { history: LeagueSagaHistoryImport; compact?: boolean }) {
  const source = history.provider === 'espn' ? 'ESPN' : 'Development';
  const seasonLabel =
    history.startSeason === history.endSeason
      ? `season ${history.startSeason}`
      : `seasons ${history.startSeason}–${history.endSeason}`;
  return (
    <div className={`bundle-hero ${compact ? 'compact' : ''}`}>
      <span className="bundle-icon">
        <Icon name="file" />
      </span>
      <div>
        <p className="eyebrow">Validated history package</p>
        <h3>{history.leagueName}</h3>
        <p>
          {source} {seasonLabel} · {history.seasons.length} {history.seasons.length === 1 ? 'season' : 'seasons'}
        </p>
      </div>
      <span className="validated-badge">
        <Icon name="check" /> Validated
      </span>
    </div>
  );
}

function HistorySummary({ history }: { history: LeagueSagaHistoryImport }) {
  const items = [
    ['Seasons', history.seasons.length],
    ['Team seasons', history.seasons.reduce((total, bundle) => total + bundle.teams.length, 0)],
    ['Roster entries', sumHistory(history, 'rosterEntries')],
    ['Matchups', sumHistory(history, 'matchups')],
    ['Draft picks', sumHistory(history, 'draftPicks')],
    ['Transactions', sumHistory(history, 'transactions')]
  ];
  return (
    <div className="summary-grid">
      {items.map(([label, value]) => (
        <Summary key={label} label={String(label)} value={String(value)} />
      ))}
    </div>
  );
}

function sumHistory(
  history: LeagueSagaHistoryImport,
  category: 'rosterEntries' | 'matchups' | 'draftPicks' | 'transactions'
): number {
  return history.seasons.reduce((total, bundle) => total + bundle[category].length, 0);
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-item">
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className={`field ${error ? 'invalid' : ''}`}>
      <span>{label}</span>
      {children}
      <small>{error ?? hint}</small>
    </label>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <span>
        <Icon name="file" />
      </span>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    copy: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4" />
        <path d="M5 20h14" />
      </>
    ),
    external: (
      <>
        <path d="M14 4h6v6" />
        <path d="m20 4-9 9" />
        <path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
      </>
    ),
    file: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </>
    ),
    gear: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.57 1.7 1.7 0 0 0 10 3h4v.08A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2 19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 21 10h.08v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.15 1.15" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.15-1.15" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M18 12a6 6 0 0 0-10-4L4 12m16 0-4 4a6 6 0 0 1-10-4" />
      </>
    ),
    shield: <path d="M12 3 4.5 6v5.5c0 4.5 3 7.7 7.5 9.5 4.5-1.8 7.5-5 7.5-9.5V6z" />,
    upload: (
      <>
        <path d="M12 16V4m-4 4 4-4 4 4" />
        <path d="M5 20h14" />
      </>
    )
  };
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
