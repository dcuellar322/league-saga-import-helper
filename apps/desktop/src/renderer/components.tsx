import type { ClipboardEvent, ReactNode } from 'react';
import type { LeagueSagaImportBundle } from '@leaguesaga/import-contract';
import type { HelperSettings, SessionStatus, UploadResult } from '../shared/ipc';
import { parseEspnLeagueInput } from '../shared/espn-input';
import type { IncludedCategories, OptionalImportCategory } from './import-review';

export type BusyAction =
  'opening-espn' | 'checking-session' | 'clearing-session' | 'importing' | 'mocking' | 'saving' | 'uploading';

export type Notice = {
  tone: 'info' | 'success' | 'error';
  title: string;
  message: string;
};

type IconName =
  'arrow' | 'check' | 'chevron' | 'download' | 'external' | 'file' | 'lock' | 'refresh' | 'shield' | 'upload';

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

export function SetupStep({
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
        kicker="Step 1"
        title="Confirm your league"
        body="We use these details to request the correct ESPN season. You can review everything before it is sent anywhere."
      />
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
      <div className="form-grid">
        <Field
          label="ESPN League ID"
          hint="Enter the number or paste the complete ESPN league URL."
          error={
            settings.leagueId && !leagueIdIsValid ? 'Enter a numeric ESPN league ID with up to 12 digits.' : undefined
          }
        >
          <input
            value={settings.leagueId}
            onPaste={pasteLeagueUrl}
            onChange={(event) => setSettings({ ...settings, leagueId: event.target.value.trim() })}
            placeholder="e.g. 123456"
            autoComplete="off"
            inputMode="numeric"
            aria-invalid={Boolean(settings.leagueId && !leagueIdIsValid)}
          />
        </Field>
        <Field
          label="ESPN season"
          hint="Confirm the year you want to import."
          error={!seasonIsValid ? 'Enter a year from 2000 to 2100.' : undefined}
        >
          <input
            type="number"
            inputMode="numeric"
            min="2000"
            max="2100"
            value={settings.season ?? ''}
            onChange={(event) => updateSeason(event.target.value)}
            aria-invalid={!seasonIsValid}
          />
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
    </section>
  );
}

export function SignInStep({
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
  return (
    <section className="step-content">
      <StepHeader
        kicker="Step 2"
        title="Connect to ESPN"
        body={`Sign in for league ${settings.leagueId}, season ${settings.season}. ESPN opens in a separate, isolated window.`}
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
              {busyAction === 'importing' ? 'Importing and validating…' : 'Import this ESPN season'}{' '}
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

export function PreviewStep({
  sourceBundle,
  bundle,
  includedCategories,
  setIncludedCategories,
  busyAction,
  canUpload,
  mockImportsEnabled,
  onSave,
  onUpload,
  onCancel
}: {
  sourceBundle: LeagueSagaImportBundle | null;
  bundle: LeagueSagaImportBundle | null;
  includedCategories: IncludedCategories;
  setIncludedCategories: (value: IncludedCategories) => void;
  busyAction: BusyAction | null;
  canUpload: boolean;
  mockImportsEnabled: boolean;
  onSave: () => void;
  onUpload: () => void;
  onCancel: () => void;
}) {
  if (!bundle || !sourceBundle) {
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
        kicker="Step 3"
        title="Review your import"
        body="This is the complete, validated data bundle. ESPN passwords and raw session cookies are never included."
      />
      <BundleHero bundle={bundle} />
      <BundleSummary bundle={bundle} />
      <ReviewCategories sourceBundle={sourceBundle} included={includedCategories} onChange={setIncludedCategories} />
      <HumanReadablePreview bundle={bundle} />
      <div className="actions step-actions">
        <button disabled={busy} onClick={onSave}>
          {busyAction === 'saving' ? 'Saving…' : 'Save JSON locally'} <Icon name="download" />
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
      <details className="json-preview">
        <summary>
          <Icon name="file" /> Inspect complete JSON <Icon name="chevron" />
        </summary>
        <pre>{JSON.stringify(bundle, null, 2)}</pre>
      </details>
    </section>
  );
}

export function UploadStep({
  bundle,
  result,
  busyAction,
  canUpload,
  mockImportsEnabled,
  onSave,
  onUpload,
  onCancel,
  onContinue
}: {
  bundle: LeagueSagaImportBundle | null;
  result: UploadResult | null;
  busyAction: BusyAction | null;
  canUpload: boolean;
  mockImportsEnabled: boolean;
  onSave: () => void;
  onUpload: () => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  if (!bundle) {
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
        kicker="Step 4"
        title={result?.ok ? 'Import delivered' : 'Finish your import'}
        body={
          result?.ok
            ? 'LeagueSaga received the reviewed bundle and will guide you through the final preview.'
            : 'Save a local copy or send the reviewed bundle to LeagueSaga.'
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
        <BundleHero bundle={bundle} compact />
      )}
      <div className="actions step-actions">
        <button disabled={busy} onClick={onSave}>
          {busyAction === 'saving' ? 'Saving…' : 'Save JSON locally'} <Icon name="download" />
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
      {result?.response ? (
        <details className="json-preview">
          <summary>
            <Icon name="file" /> View LeagueSaga response <Icon name="chevron" />
          </summary>
          <pre>{JSON.stringify(result.response, null, 2)}</pre>
        </details>
      ) : null}
    </section>
  );
}

function ReviewCategories({
  sourceBundle,
  included,
  onChange
}: {
  sourceBundle: LeagueSagaImportBundle;
  included: IncludedCategories;
  onChange: (value: IncludedCategories) => void;
}) {
  const categories: Array<{ key: OptionalImportCategory; label: string; count: number; description: string }> = [
    {
      key: 'rosterEntries',
      label: 'Rosters',
      count: sourceBundle.rosterEntries.length,
      description: 'Players and lineup slots'
    },
    {
      key: 'matchups',
      label: 'Matchups',
      count: sourceBundle.matchups.length,
      description: 'Scores, opponents, and winners'
    },
    {
      key: 'draftPicks',
      label: 'Draft',
      count: sourceBundle.draftPicks.length,
      description: 'Picks, keepers, and auction prices'
    },
    {
      key: 'transactions',
      label: 'Transactions',
      count: sourceBundle.transactions.length,
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

function HumanReadablePreview({ bundle }: { bundle: LeagueSagaImportBundle }) {
  const teamNames = new Map(bundle.teams.map((team) => [team.externalRef.externalId, team.displayName]));
  return (
    <section className="readable-preview" aria-labelledby="readable-preview-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Human-readable review</p>
          <h3 id="readable-preview-title">What will be sent</h3>
        </div>
      </div>
      <div className="preview-sections">
        <details open>
          <summary>
            Teams and owners <span>{bundle.teams.length}</span>
          </summary>
          <ul>
            {bundle.teams.map((team) => (
              <li key={team.externalRef.externalId}>
                <strong>{team.displayName}</strong>
                <small>
                  {team.ownerDisplayNames.length ? team.ownerDisplayNames.join(', ') : 'No owner name returned by ESPN'}
                </small>
              </li>
            ))}
          </ul>
        </details>
        {bundle.rosterEntries.length > 0 && (
          <details>
            <summary>
              Roster entries <span>{bundle.rosterEntries.length}</span>
            </summary>
            <ul>
              {bundle.rosterEntries.slice(0, 20).map((entry, index) => (
                <li key={`${entry.teamExternalId}-${entry.player.externalRef.externalId}-${index}`}>
                  <strong>{entry.player.fullName}</strong>
                  <small>
                    {teamNames.get(entry.teamExternalId) ?? entry.teamExternalId}
                    {entry.lineupSlot ? ` · ${entry.lineupSlot}` : ''}
                  </small>
                </li>
              ))}
            </ul>
            {bundle.rosterEntries.length > 20 && (
              <p>Plus {bundle.rosterEntries.length - 20} more roster entries in the complete JSON.</p>
            )}
          </details>
        )}
        {bundle.matchups.length > 0 && (
          <details>
            <summary>
              Matchups <span>{bundle.matchups.length}</span>
            </summary>
            <ul>
              {bundle.matchups.slice(0, 12).map((matchup) => (
                <li key={matchup.externalRef.externalId}>
                  <strong>Week {matchup.scoringPeriodId}</strong>
                  <small>
                    {matchup.home ? (teamNames.get(matchup.home.teamExternalId) ?? matchup.home.teamExternalId) : 'Bye'}{' '}
                    vs{' '}
                    {matchup.away ? (teamNames.get(matchup.away.teamExternalId) ?? matchup.away.teamExternalId) : 'Bye'}
                  </small>
                </li>
              ))}
            </ul>
            {bundle.matchups.length > 12 && (
              <p>Plus {bundle.matchups.length - 12} more matchups in the complete JSON.</p>
            )}
          </details>
        )}
        {bundle.draftPicks.length > 0 && (
          <details>
            <summary>
              Draft picks <span>{bundle.draftPicks.length}</span>
            </summary>
            <p>Player, team, round, keeper, and auction details returned by ESPN.</p>
          </details>
        )}
        {bundle.transactions.length > 0 && (
          <details>
            <summary>
              Transactions <span>{bundle.transactions.length}</span>
            </summary>
            <p>Add, drop, waiver, free-agent, draft, and trade activity returned by ESPN.</p>
          </details>
        )}
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

function BundleHero({ bundle, compact = false }: { bundle: LeagueSagaImportBundle; compact?: boolean }) {
  return (
    <div className={`bundle-hero ${compact ? 'compact' : ''}`}>
      <span className="bundle-icon">
        <Icon name="file" />
      </span>
      <div>
        <p className="eyebrow">Validated import bundle</p>
        <h3>{bundle.league.name}</h3>
        <p>
          ESPN season {bundle.league.season} · {bundle.teams.length} teams
        </p>
      </div>
      <span className="validated-badge">
        <Icon name="check" /> Validated
      </span>
    </div>
  );
}

function BundleSummary({ bundle }: { bundle: LeagueSagaImportBundle }) {
  const items = [
    ['Teams', bundle.teams.length],
    ['Roster entries', bundle.rosterEntries.length],
    ['Matchups', bundle.matchups.length],
    ['Draft picks', bundle.draftPicks.length],
    ['Transactions', bundle.transactions.length],
    ['Contract', bundle.metadata.contractVersion]
  ];
  return (
    <div className="summary-grid">
      {items.map(([label, value]) => (
        <Summary key={label} label={String(label)} value={String(value)} />
      ))}
    </div>
  );
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
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
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
