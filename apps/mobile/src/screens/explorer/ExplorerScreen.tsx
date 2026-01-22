import React, { useState, useMemo } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useExplorerFiles } from "./hooks/useExplorerFiles";
import { ListView } from "./views/ListView";
import { GridView } from "./views/GridView";
import type { Device } from "@sd/ts-client";
import { useNormalizedQuery } from "../../client";
import { GlassButton } from "../../components/GlassButton";
import { GlassContextMenu } from "../../components/GlassContextMenu";
import { SearchToolbar } from "../../components/SearchToolbar";
import { useSearchStore } from "./context/SearchContext";
import { List, ArrowLeft } from "phosphor-react-native";

type ViewMode = "list" | "grid";

export function ExplorerScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const searchParams = useLocalSearchParams<{
		type?: string;
		path?: string;
		view?: string;
		id?: string;
	}>();
	const [viewMode, setViewMode] = useState<ViewMode>("list");
	const { isSearchMode, query } = useSearchStore();

	// Parse params into the format expected by hooks
	const params = useMemo(() => {
		if (searchParams.type === "path" && searchParams.path) {
			return { type: "path" as const, path: searchParams.path };
		}
		if (searchParams.type === "view" && searchParams.view) {
			return {
				type: "view" as const,
				view: searchParams.view,
				id: searchParams.id,
			};
		}
		return undefined;
	}, [searchParams]);

	// Fetch files
	const { files, isLoading, source } = useExplorerFiles(params);

	// Fetch device for path display
	const { data: devices } = useNormalizedQuery<any, Device[]>({
		query: "devices.list",
		input: {
			include_offline: true,
			include_details: false,
			show_paired: true,
		},
		resourceType: "device",
		enabled: params?.type === "path",
	});

	// Get title for header
	const title = (() => {
		if (params?.type === "view") {
			if (params.view === "devices") return "Devices";
			if (params.view === "device" && params.id) {
				const device = devices?.find((d) => d.id === params.id);
				return device?.name || "Device";
			}
		}

		if (params?.type === "path") {
			try {
				const sdPath = JSON.parse(params.path);
				if (sdPath.Physical) {
					const device = devices?.find(
						(d) => d.slug === sdPath.Physical.device_slug,
					);
					const pathParts = sdPath.Physical.path.split("/").filter(Boolean);
					if (pathParts.length === 0) {
						return device?.name || "Root";
					}
					return pathParts[pathParts.length - 1];
				}
			} catch (e) {
				console.error("[ExplorerScreen] Failed to parse path:", e);
			}
		}

		return "Explorer";
	})();

	const handleFilePress = (file: any) => {
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
				style={{ paddingTop: insets.top }}
			>
				<View className="relative flex-row items-center justify-between px-4 h-14">
					{/* Back button */}
					<GlassButton
						onPress={() => router.back()}
						icon={
							<ArrowLeft size={20} color="hsl(235, 10%, 55%)" weight="bold" />
						}
					/>

					{/* Title - absolutely centered */}
					<Text
						className="absolute left-0 right-0 text-ink font-semibold text-lg text-center"
						pointerEvents="none"
					>
						{title}
					</Text>

					{/* View mode menu */}
					<GlassContextMenu
						items={[
							{
								label: "List View",
								onPress: () => setViewMode("list"),
								icon: (
									<List
										size={20}
										color={
											viewMode === "list"
												? "hsl(208, 100%, 57%)"
												: "hsl(235, 10%, 55%)"
										}
										weight="bold"
									/>
								),
								active: viewMode === "list",
							},
							{
								label: "Grid View",
								onPress: () => setViewMode("grid"),
								icon: (
									<Text
										style={{
											fontSize: 20,
											color:
												viewMode === "grid"
													? "hsl(208, 100%, 57%)"
													: "hsl(235, 10%, 55%)",
										}}
									>
										⊞
									</Text>
								),
								active: viewMode === "grid",
							},
						]}
						trigger={
							<GlassButton
								icon={
									<Text className="text-ink-dull" style={{ fontSize: 18 }}>
										⋯
									</Text>
								}
							/>
						}
					/>
				</View>

				{/* Search Toolbar */}
				{isSearchMode && query.length >= 2 && <SearchToolbar />}
			</View>

			{/* Content */}
			{isLoading ? (
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator size="large" color="hsl(208, 100%, 57%)" />
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
