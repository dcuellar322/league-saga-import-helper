import { useEffect, useRef, useState } from 'react';
import type { UpdateInfo } from '../shared/ipc';
import type { Notice, UpdateBusy } from './components';

type UseHelperShellOptions = {
  showError: (error: unknown) => void;
  setNotice: (notice: Notice | null) => void;
};

export function useHelperShell({ showError, setNotice }: UseHelperShellOptions) {
  const bridge = window.leagueSaga;
  const [version, setVersion] = useState('');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateBusy, setUpdateBusy] = useState<UpdateBusy>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const showErrorRef = useRef(showError);

  useEffect(() => {
    showErrorRef.current = showError;
  }, [showError]);

  useEffect(() => {
    let disposed = false;
    const reportInitializationError = (error: unknown) => {
      if (!disposed) showErrorRef.current(error);
    };

    void bridge
      .appVersion()
      .then((nextVersion) => {
        if (!disposed) setVersion(nextVersion);
      })
      .catch(reportInitializationError);
    void bridge
      .checkForUpdates()
      .then((nextUpdate) => {
        if (!disposed) setUpdateInfo(nextUpdate);
      })
      .catch(reportInitializationError);

    return () => {
      disposed = true;
    };
  }, [bridge]);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [settingsOpen]);

  async function checkForUpdates() {
    setUpdateBusy('checking');
    try {
      setUpdateInfo(await bridge.checkForUpdates());
    } catch (error) {
      showError(error);
    } finally {
      setUpdateBusy(null);
    }
  }

  async function downloadAndInstallUpdate() {
    setUpdateBusy('downloading');
    try {
      await bridge.downloadUpdate();
      await bridge.installUpdate();
    } catch (error) {
      showError(error);
      setUpdateBusy(null);
    }
  }

  async function openReleaseNotes() {
    try {
      if (updateInfo?.releaseUrl) await bridge.openUpdateUrl(updateInfo.releaseUrl);
    } catch (error) {
      showError(error);
    }
  }

  async function saveDiagnostics() {
    try {
      const result = await bridge.saveDiagnostics();
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
      await bridge.openProjectUrl(url);
    } catch (error) {
      showError(error);
    }
  }

  return {
    version,
    updateInfo,
    updateBusy,
    settingsOpen,
    setSettingsOpen,
    checkForUpdates,
    downloadAndInstallUpdate,
    openReleaseNotes,
    saveDiagnostics,
    openProjectDocument
  };
}
