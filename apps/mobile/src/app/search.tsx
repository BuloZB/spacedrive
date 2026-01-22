import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { GlassSearchBar } from "../components/GlassSearchBar";
import { SearchToolbar } from "../components/SearchToolbar";
import { ListView } from "../screens/explorer/views/ListView";
import { GridView } from "../screens/explorer/views/GridView";
import { GlassButton } from "../components/GlassButton";
import { useSearchStore } from "../screens/explorer/context/SearchContext";
import { useSearchFiles } from "@sd/ts-client";
import type { File } from "@sd/ts-client";
import type { TextInput } from "react-native";
import { X } from "phosphor-react-native";

type SearchViewMode = "list" | "grid";

export default function SearchScreen() {
	const router = useRouter();
	const searchInputRef = useRef<TextInput>(null);
	const [viewMode, setViewMode] = useState<SearchViewMode>("list");

	const { query, scope, isSearchMode, enterSearchMode, exitSearchMode, setSearchQuery } =
		useSearchStore();

	// Ref to track current query for cleanup without triggering effect re-runs
	const queryRef = useRef(query);
	useEffect(() => {
		queryRef.current = query;
	}, [query]);

	// Get current path from route params if needed (for folder scope)
	// For now, we'll use library scope by default
	const currentPath = undefined;

	// Fetch search results
	const { files, isLoading } = useSearchFiles({
		query,
		scope,
		currentPath,
		enabled: isSearchMode && query.length >= 2,
	});

	// Auto-focus search input on mount
	useEffect(() => {
		// Focus input after a short delay
		const timer = setTimeout(() => {
			searchInputRef.current?.focus();
		}, 100);
		return () => clearTimeout(timer);
	}, []);

	// Exit search mode when screen loses focus (user navigated away)
	useFocusEffect(
		React.useCallback(() => {
			return () => {
				// Only exit search mode if query is empty when navigating away
				// Using ref to avoid stale closure issues when query changes
				if (!queryRef.current) {
					exitSearchMode();
				}
			};
		}, [exitSearchMode])
	);

	const handleSearchChange = useCallback((value: string) => {
		// Update query in store immediately so TextInput shows what user types
		setSearchQuery(value);

		if (value.length === 0) {
			// Exit search mode when query is cleared, but keep the screen open
			// User can manually navigate back if they want to leave
			exitSearchMode();
		} else {
			// Enter search mode when user starts typing
			// The actual search query execution is handled by useSearchFiles which checks query.length >= 2
			enterSearchMode(value, scope);
		}
	}, [setSearchQuery, exitSearchMode, enterSearchMode, scope]);


	const handleFilePress = (file: File) => {
		// Exit search mode when navigating to a file
		exitSearchMode();

		// If it's a directory, navigate into it
		if (file.kind === "Directory") {
			router.push({
				pathname: "/explorer",
				params: {
					type: "path",
					path: JSON.stringify(file.sd_path),
				},
			});
		}
		// TODO: Handle file preview
	};

	return (
		<View className="flex-1 bg-app">
			{/* Header */}
			<View
				className="bg-app-box border-b border-app-line"
				style={{ paddingTop: 18 }}
			>
				<View className="px-4 pb-3 flex-row items-center gap-3">
					<View className="flex-1">
						<GlassSearchBar
							ref={searchInputRef}
							value={query}
							onChange={handleSearchChange}
							editable={true}
							autoFocus
						/>
					</View>
					<GlassButton
						onPress={() => router.back()}
						icon={<X size={20} color="hsl(235, 10%, 55%)" weight="bold" />}
					/>
				</View>

				{/* Search Toolbar */}
				{isSearchMode && query.length >= 2 && (
					<SearchToolbar viewMode={viewMode} setViewMode={setViewMode} />
				)}
			</View>

			{/* Content */}
			{isSearchMode && query.length < 2 ? (
				<View className="flex-1 items-center justify-center p-8">
					<Text className="text-ink-dull text-sm text-center">
						Type at least 2 characters to search
					</Text>
				</View>
			) : isLoading ? (
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator size="large" color="hsl(208, 100%, 57%)" />
				</View>
			) : files.length === 0 && query.length >= 2 ? (
				<View className="flex-1 items-center justify-center p-8">
					<Text className="text-ink-dull text-sm text-center">
						No results found for "{query}"
					</Text>
				</View>
			) : (
				<>
					{viewMode === "list" ? (
						<ListView files={files} onFilePress={handleFilePress} />
					) : (
						<GridView files={files} onFilePress={handleFilePress} />
					)}
				</>
			)}
		</View>
	);
}
