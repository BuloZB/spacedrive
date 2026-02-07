import { useCallback, useEffect, useState } from 'react';

export interface UpdateStatus {
	checking: boolean;
	available: boolean;
	version?: string;
	downloading: boolean;
	installing: boolean;
	readyToInstall: boolean;
	error?: string;
	downloadProgress?: number;
	downloadedBytes?: number;
	totalBytes?: number;
}

interface Update {
	version: string;
	date?: string;
	body?: string;
	download: (
		onEvent: (event: DownloadEvent) => void
	) => Promise<void>;
	install: () => Promise<void>;
}

type DownloadEvent =
	| { event: 'Started'; data: { contentLength?: number } }
	| { event: 'Progress'; data: { chunkLength: number } }
	| { event: 'Finished' };

const isWindows = () => {
	return navigator.userAgent.includes('Windows');
};

const isTauri = () => {
	return '__TAURI_INTERNALS__' in window;
};

export function useAutoUpdater(checkOnMount = false) {
	const [status, setStatus] = useState<UpdateStatus>({
		checking: false,
		available: false,
		downloading: false,
		installing: false,
		readyToInstall: false
	});

	const [update, setUpdate] = useState<Update | null>(null);

	const checkForUpdates = useCallback(async () => {
		if (!isTauri()) {
			return;
		}

		try {
			setStatus((prev) => ({ ...prev, checking: true, error: undefined }));

			const { check } = await import('@tauri-apps/plugin-updater');
			const foundUpdate = await check();

			if (foundUpdate?.available) {
				setUpdate(foundUpdate as Update);
				setStatus({
					checking: false,
					available: true,
					version: foundUpdate.version,
					downloading: false,
					installing: false,
					readyToInstall: false
				});
			} else {
				setStatus({
					checking: false,
					available: false,
					downloading: false,
					installing: false,
					readyToInstall: false
				});
			}
		} catch (error) {
			setStatus({
				checking: false,
				available: false,
				downloading: false,
				installing: false,
				readyToInstall: false,
				error: error instanceof Error ? error.message : 'Failed to check for updates'
			});
		}
	}, []);

	const downloadAndInstall = async () => {
		if (!update || !isTauri()) return;

		try {
			setStatus((prev) => ({ ...prev, downloading: true, error: undefined }));

			let downloadedBytes = 0;
			let totalBytes = 0;

			await update.download((event) => {
				switch (event.event) {
					case 'Started':
						totalBytes = event.data.contentLength || 0;
						downloadedBytes = 0;
						setStatus((prev) => ({
							...prev,
							downloading: true,
							totalBytes,
							downloadedBytes: 0,
							downloadProgress: 0
						}));
						break;
					case 'Progress': {
						downloadedBytes += event.data.chunkLength;
						const progress =
							totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : undefined;
						setStatus((prev) => ({
							...prev,
							downloadedBytes,
							downloadProgress: progress
						}));
						break;
					}
					case 'Finished':
						setStatus((prev) => ({
							...prev,
							downloading: false,
							readyToInstall: true,
							downloadProgress: 100
						}));
						break;
				}
			});
		} catch (error) {
			setStatus((prev) => ({
				...prev,
				downloading: false,
				installing: false,
				readyToInstall: false,
				downloadProgress: undefined,
				downloadedBytes: undefined,
				totalBytes: undefined,
				error: error instanceof Error ? error.message : 'Failed to download update'
			}));
		}
	};

	const restartAndInstall = async () => {
		if (!update || !isTauri()) return;

		try {
			setStatus((prev) => ({ ...prev, installing: true, error: undefined }));

			await update.install();

			if (!isWindows()) {
				const { relaunch } = await import('@tauri-apps/plugin-process');
				await relaunch();
			}
		} catch (error) {
			setStatus((prev) => ({
				...prev,
				installing: false,
				error: error instanceof Error ? error.message : 'Failed to install update'
			}));
		}
	};

	useEffect(() => {
		if (checkOnMount && isTauri()) {
			checkForUpdates();
		}
	}, [checkOnMount, checkForUpdates]);

	return {
		status,
		checkForUpdates,
		downloadAndInstall,
		restartAndInstall
	};
}
