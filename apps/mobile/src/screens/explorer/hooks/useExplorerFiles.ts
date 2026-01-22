import { useMemo } from "react";
import type { File, SdPath } from "@sd/ts-client";
import { useNormalizedQuery, useSearchFiles } from "@sd/ts-client";
import { useVirtualListing } from "./useVirtualListing";
import { useSearchStore } from "../context/SearchContext";

export type FileSource = "search" | "virtual" | "directory";

export interface ExplorerFilesResult {
	files: File[];
	isLoading: boolean;
	source: FileSource;
}

/**
 * Centralized hook for fetching files in the mobile explorer.
 *
 * Handles three file sources with priority:
 * 1. Search results (when in search mode)
 * 2. Virtual listings (devices/volumes/locations)
 * 3. Directory listings (normal file browsing)
 */
export function useExplorerFiles(
	params:
		| { type: "path"; path: string }
		| { type: "view"; view: string; id?: string }
		| undefined,
): ExplorerFilesResult {
	const { isSearchMode, query, scope } = useSearchStore();

	// Check for virtual listing first
	const { files: virtualFiles, isVirtualView, isLoading: virtualLoading } =
		useVirtualListing(params);

	// Parse path for directory listing
	const currentPath: SdPath | null = useMemo(() => {
		if (params?.type === "path") {
			try {
				return JSON.parse(params.path) as SdPath;
			} catch (e) {
				console.error("[useExplorerFiles] Failed to parse path:", e);
				return null;
			}
		}
		return null;
	}, [params]);

	// Search query
	const { files: searchFiles, isLoading: searchLoading } = useSearchFiles({
		query,
		scope,
		currentPath: scope === "folder" && currentPath ? currentPath : undefined,
		enabled: isSearchMode && query.length >= 2,
	});

	// Directory query
	const directoryQuery = useNormalizedQuery({
		query: "files.directory_listing",
		input: currentPath
			? {
					path: currentPath,
					limit: null,
					include_hidden: false,
					sort_by: "name", // Default to name sorting
					folders_first: true,
				}
			: (null as any),
		resourceType: "file",
		enabled: !!currentPath && !isVirtualView && !isSearchMode,
		pathScope: currentPath ?? undefined,
	});

	// Determine source and files with priority: search > virtual > directory
	const source: FileSource = isSearchMode
		? "search"
		: isVirtualView
			? "virtual"
			: "directory";

	const files = useMemo(() => {
		if (isSearchMode) {
			return searchFiles || [];
		}
		if (isVirtualView) {
			return virtualFiles || [];
		}
		return (directoryQuery.data as { files?: File[] })?.files || [];
	}, [
		isSearchMode,
		isVirtualView,
		searchFiles,
		virtualFiles,
		directoryQuery.data,
	]);

	const isLoading = isSearchMode
		? searchLoading
		: isVirtualView
			? virtualLoading
			: directoryQuery.isLoading;

	return {
		files,
		isLoading,
		source,
	};
}
