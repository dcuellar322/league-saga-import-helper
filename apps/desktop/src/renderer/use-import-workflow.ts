import { useCallback, useEffect, useMemo, useReducer, useRef, type Dispatch, type SetStateAction } from 'react';
import type { DeepLinkSettings, HelperSettings, ImportSourceProvider } from '../shared/ipc';
import { formatError } from './errors';
import { createDeliveryHistory, type IncludedCategories } from './import-review';
import {
  createInitialImportWorkflowState,
  getImportWorkflowValidation,
  importWorkflowReducer,
  type ImportStep
} from './import-workflow-state';
import type { BusyAction, Notice } from './components';

export function useImportWorkflow() {
  const bridge = window.leagueSaga;
  const [state, dispatch] = useReducer(importWorkflowReducer, undefined, createInitialImportWorkflowState);
  const operationRevision = useRef(0);
  const activeOperation = useRef<BusyAction | null>(null);
  const validation = useMemo(() => getImportWorkflowValidation(state.settings), [state.settings]);
  const deliveryHistory = useMemo(
    () => (state.history ? createDeliveryHistory(state.history, state.includedCategories) : null),
    [state.history, state.includedCategories]
  );

  const setNotice = useCallback((notice: Notice | null) => {
    dispatch({ type: 'notice-changed', notice });
  }, []);

  const showError = useCallback((error: unknown) => {
    dispatch({
      type: 'notice-changed',
      notice: { tone: 'error', title: 'Something needs attention', message: formatError(error) }
    });
  }, []);

  useEffect(() => {
    let disposed = false;

    const reportInitializationError = (error: unknown) => {
      if (disposed) return;
      setNotice({
        tone: 'error',
        title: 'The helper could not finish starting',
        message: formatError(error)
      });
    };

    const applyDeepLink = (settings: DeepLinkSettings) => {
      if (disposed) return;
      operationRevision.current += 1;
      if (activeOperation.current === 'importing') void bridge.cancelEspnImport().catch(() => undefined);
      if (activeOperation.current === 'uploading') void bridge.cancelUpload().catch(() => undefined);
      activeOperation.current = null;
      dispatch({ type: 'deep-link-received', settings });
    };

    const unsubscribe = bridge.onDeepLink(applyDeepLink);

    void bridge
      .runtimeConfig()
      .then((config) => {
        if (!disposed) dispatch({ type: 'runtime-config-loaded', config });
      })
      .catch(reportInitializationError);
    void bridge
      .getSettings()
      .then((settings) => {
        if (!disposed) dispatch({ type: 'settings-loaded', settings });
      })
      .catch(reportInitializationError);
    void bridge
      .getEspnSessionStatus()
      .then((status) => {
        if (!disposed) dispatch({ type: 'session-status-changed', status });
      })
      .catch(reportInitializationError);
    void bridge
      .rendererReady()
      .then((pendingDeepLink) => {
        if (pendingDeepLink) applyDeepLink(pendingDeepLink);
      })
      .catch(reportInitializationError);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [bridge, setNotice]);

  useEffect(() => {
    if (
      state.step !== 'connect' ||
      state.settings.provider !== 'espn' ||
      state.sessionStatus.isSignedIn ||
      state.busyAction === 'clearing-session'
    )
      return;
    let disposed = false;
    const poll = async () => {
      try {
        const status = await bridge.getEspnSessionStatus();
        if (disposed) return;
        dispatch({ type: 'session-status-changed', status });
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
  }, [bridge, setNotice, state.busyAction, state.sessionStatus.isSignedIn, state.settings.provider, state.step]);

  const setSettings: Dispatch<SetStateAction<HelperSettings>> = (next) => {
    const settings = typeof next === 'function' ? next(state.settings) : next;
    dispatch({ type: 'settings-changed', settings });
  };

  const setIncludedCategories: Dispatch<SetStateAction<IncludedCategories>> = (next) => {
    const categories = typeof next === 'function' ? next(state.includedCategories) : next;
    dispatch({ type: 'included-categories-changed', categories });
  };

  async function refreshStatus(isCurrent: () => boolean = () => true) {
    const status = await bridge.getEspnSessionStatus();
    if (isCurrent()) dispatch({ type: 'session-status-changed', status });
    return status;
  }

  async function persistSettings(next = state.settings, isCurrent: () => boolean = () => true) {
    const saved = await bridge.saveSettings(next);
    if (isCurrent()) dispatch({ type: 'settings-saved', settings: saved });
    return saved;
  }

  async function runBusy(
    action: BusyAction,
    operation: (isCurrent: () => boolean) => Promise<void>,
    clearUploadResult = false
  ) {
    const revision = operationRevision.current;
    const isCurrent = () => operationRevision.current === revision;
    activeOperation.current = action;
    startBusy(action, clearUploadResult);
    try {
      await operation(isCurrent);
    } catch (error) {
      if (isCurrent()) showError(error);
    } finally {
      if (isCurrent()) {
        if (activeOperation.current === action) activeOperation.current = null;
        dispatch({ type: 'busy-finished' });
      }
    }
  }

  function startBusy(action: NonNullable<typeof state.busyAction>, clearUploadResult = false) {
    dispatch({ type: 'busy-started', action, clearUploadResult });
  }

  function goToStep(step: ImportStep) {
    dispatch({ type: 'go-to-step', step });
  }

  function chooseProvider(provider: ImportSourceProvider) {
    dispatch({ type: 'provider-chosen', provider });
  }

  async function checkSession() {
    await runBusy('checking-session', async (isCurrent) => {
      const status = await refreshStatus(isCurrent);
      if (!isCurrent()) return;
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
    });
  }

  async function openEspn() {
    await runBusy('opening-espn', async (isCurrent) => {
      const saved = await persistSettings(state.settings, isCurrent);
      if (!isCurrent()) return;
      await bridge.openEspnLogin({ leagueId: saved.leagueId, season: saved.season });
      if (!isCurrent()) return;
      goToStep('connect');
      setNotice({
        tone: 'info',
        title: 'ESPN opened in a separate window',
        message: 'Sign in there, then return to this window and choose “Check sign-in status.”'
      });
    });
  }

  async function importEspn() {
    await runBusy(
      'importing',
      async (isCurrent) => {
        const saved = await persistSettings(state.settings, isCurrent);
        if (!isCurrent()) return;
        const result = await bridge.importFromEspn({
          leagueId: saved.leagueId,
          season: saved.season,
          importSessionId: saved.importSessionId
        });
        if (!isCurrent()) return;
        dispatch({
          type: 'import-ready',
          history: result.history,
          notice: result.warnings.length
            ? { tone: 'info', title: 'Import ready with notes', message: result.warnings.join(' ') }
            : {
                tone: 'success',
                title: 'League history ready to review',
                message: `${result.history.seasons.length} season${result.history.seasons.length === 1 ? '' : 's'} were normalized and validated locally.`
              }
        });
      },
      true
    );
  }

  async function importMock() {
    await runBusy(
      'mocking',
      async (isCurrent) => {
        const saved = await persistSettings(state.settings, isCurrent);
        if (!isCurrent()) return;
        const result = await bridge.createMockImport({
          leagueId: saved.leagueId || 'mock-league',
          season: saved.season,
          importSessionId: saved.importSessionId
        });
        if (!isCurrent()) return;
        dispatch({
          type: 'import-ready',
          history: result.history,
          notice: {
            tone: 'info',
            title: 'Development preview',
            message: 'Mock data was created locally. No request was made to ESPN.'
          }
        });
      },
      true
    );
  }

  async function saveBundle() {
    if (!deliveryHistory) return;
    await runBusy('saving', async (isCurrent) => {
      const result = await bridge.saveBundleToDisk(deliveryHistory);
      if (isCurrent() && !result.canceled) {
        setNotice({
          tone: 'success',
          title: 'JSON saved locally',
          message: result.filePath ?? 'Your historical import package was saved.'
        });
      }
    });
  }

  async function upload() {
    if (!deliveryHistory) return;
    if (!validation.canUpload) {
      setNotice({
        tone: 'info',
        title: 'Open this helper from LeagueSaga to send data',
        message: 'This manual session can save JSON locally, but it does not include a secure LeagueSaga upload token.'
      });
      return;
    }
    await runBusy('uploading', async (isCurrent) => {
      const saved = await persistSettings(state.settings, isCurrent);
      if (!isCurrent()) return;
      const result = await bridge.uploadBundle({
        apiBaseUrl: saved.apiBaseUrl,
        importToken: saved.importToken,
        bundle: deliveryHistory
      });
      if (isCurrent()) dispatch({ type: 'upload-finished', result });
    });
  }

  async function cancelBusyAction() {
    try {
      if (state.busyAction === 'importing') await bridge.cancelEspnImport();
      if (state.busyAction === 'uploading') await bridge.cancelUpload();
    } catch (error) {
      showError(error);
    }
  }

  async function continueInLeagueSaga() {
    try {
      if (state.uploadResult?.continuationUrl) await bridge.openLeagueSagaUrl(state.uploadResult.continuationUrl);
    } catch (error) {
      showError(error);
    }
  }

  async function clearSession() {
    await runBusy('clearing-session', async (isCurrent) => {
      await bridge.clearEspnSession();
      await refreshStatus(isCurrent);
      if (!isCurrent()) return;
      setNotice({
        tone: 'success',
        title: 'ESPN session cleared',
        message: 'The helper removed its locally stored ESPN session.'
      });
    });
  }

  return {
    ...state,
    ...validation,
    deliveryHistory,
    setSettings,
    setIncludedCategories,
    setNotice,
    showError,
    goToStep,
    chooseProvider,
    checkSession,
    openEspn,
    importEspn,
    importMock,
    saveBundle,
    upload,
    cancelBusyAction,
    continueInLeagueSaga,
    clearSession
  };
}
