/**
 * Tauri v2 Auto-updater Integration Example
 *
 * This file demonstrates how to integrate the autoupdater into your frontend.
 * You can adapt this code to fit your UI/UX requirements.
 */

import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateCheckResult {
  available: boolean;
  version?: string;
  notes?: string;
  currentVersion: string;
}

export interface UpdateProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

export type UpdateProgressCallback = (progress: UpdateProgress) => void;

/**
 * Check if an update is available
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    const update = await check();

    if (update === null) {
      return {
        available: false,
        currentVersion: getCurrentVersion(),
      };
    }

    return {
      available: true,
      version: update.version,
      notes: update.body,
      currentVersion: getCurrentVersion(),
    };
  } catch (error) {
    console.error('Failed to check for updates:', error);
    throw new Error(`Update check failed: ${error}`);
  }
}

/**
 * Download and install an update with progress tracking
 */
export async function downloadAndInstallUpdate(
  onProgress?: UpdateProgressCallback
): Promise<void> {
  try {
    const update = await check();

    if (!update) {
      throw new Error('No update available');
    }

    let downloaded = 0;
    let contentLength = 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength || 0;
          console.log(`Starting download: ${formatBytes(contentLength)}`);
          if (onProgress) {
            onProgress({
              downloaded: 0,
              total: contentLength,
              percentage: 0,
            });
          }
          break;

        case 'Progress':
          downloaded += event.data.chunkLength;
          const percentage = contentLength > 0
            ? Math.round((downloaded / contentLength) * 100)
            : 0;

          console.log(
            `Download progress: ${formatBytes(downloaded)}/${formatBytes(contentLength)} (${percentage}%)`
          );

          if (onProgress) {
            onProgress({
              downloaded,
              total: contentLength,
              percentage,
            });
          }
          break;

        case 'Finished':
          console.log('Download finished, installing...');
          if (onProgress) {
            onProgress({
              downloaded: contentLength,
              total: contentLength,
              percentage: 100,
            });
          }
          break;
      }
    });

    console.log('Update installed successfully');
  } catch (error) {
    console.error('Failed to download/install update:', error);
    throw new Error(`Update installation failed: ${error}`);
  }
}

/**
 * Install update and restart the application
 */
export async function installUpdateAndRestart(
  onProgress?: UpdateProgressCallback
): Promise<void> {
  await downloadAndInstallUpdate(onProgress);
  console.log('Restarting application...');
  await relaunch();
}

/**
 * Check for updates on app startup (silent check)
 */
export async function checkForUpdateOnStartup(
  onUpdateAvailable?: (result: UpdateCheckResult) => void
): Promise<void> {
  try {
    const result = await checkForUpdate();

    if (result.available) {
      console.log(`Update available: v${result.version}`);
      onUpdateAvailable?.(result);
    } else {
      console.log('App is up to date');
    }
  } catch (error) {
    console.error('Startup update check failed:', error);
  }
}

/**
 * Complete update flow with user prompts
 * This is a reference implementation - adapt to your UI framework
 */
export async function performUpdateWithPrompts(): Promise<void> {
  try {
    // Check for update
    const result = await checkForUpdate();

    if (!result.available) {
      alert('You are running the latest version!');
      return;
    }

    // Prompt user
    const shouldUpdate = confirm(
      `A new version (v${result.version}) is available!\n\n` +
      `Current version: v${result.currentVersion}\n\n` +
      `${result.notes || 'No release notes available'}\n\n` +
      `Would you like to download and install it now?`
    );

    if (!shouldUpdate) {
      return;
    }

    // Download and install with progress
    console.log('Starting update download...');

    await installUpdateAndRestart((progress) => {
      console.log(`Update progress: ${progress.percentage}%`);
      // Update UI with progress
    });

  } catch (error) {
    alert(`Update failed: ${error}`);
  }
}

/**
 * Get current app version from package.json or Tauri config
 */
function getCurrentVersion(): string {
  // In a real implementation, you might read this from:
  // - import.meta.env.PACKAGE_VERSION
  // - A constant exported from your build config
  // - The app's package.json
  return '2.0.0-pre.1'; // Replace with actual version
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Example: React hook for update checking
 * Adapt this to your framework (React, Solid, Vue, etc.)
 */
/*
import { useState, useEffect } from 'react';

export function useUpdateChecker(checkOnMount = true) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  const checkForUpdates = async () => {
    setIsChecking(true);
    try {
      const result = await checkForUpdate();
      setUpdateInfo(result);
      setUpdateAvailable(result.available);
      return result;
    } catch (error) {
      console.error('Update check failed:', error);
      throw error;
    } finally {
      setIsChecking(false);
    }
  };

  const installUpdate = async () => {
    setIsInstalling(true);
    setProgress({ downloaded: 0, total: 0, percentage: 0 });

    try {
      await installUpdateAndRestart((p) => setProgress(p));
    } catch (error) {
      console.error('Update installation failed:', error);
      setIsInstalling(false);
      throw error;
    }
  };

  useEffect(() => {
    if (checkOnMount) {
      checkForUpdates();
    }
  }, []);

  return {
    updateAvailable,
    updateInfo,
    isChecking,
    isInstalling,
    progress,
    checkForUpdates,
    installUpdate,
  };
}
*/

/**
 * Example: Scheduled update checks
 * Check for updates every 6 hours
 */
export function startPeriodicUpdateChecks(
  intervalHours: number = 6,
  onUpdateAvailable?: (result: UpdateCheckResult) => void
): () => void {
  const intervalMs = intervalHours * 60 * 60 * 1000;

  const checkAndNotify = async () => {
    try {
      const result = await checkForUpdate();
      if (result.available) {
        onUpdateAvailable?.(result);
      }
    } catch (error) {
      console.error('Periodic update check failed:', error);
    }
  };

  // Check immediately
  checkAndNotify();

  // Check periodically
  const intervalId = setInterval(checkAndNotify, intervalMs);

  // Return cleanup function
  return () => clearInterval(intervalId);
}
