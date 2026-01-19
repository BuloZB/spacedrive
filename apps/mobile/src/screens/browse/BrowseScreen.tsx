import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLibraryQuery } from "../../client";
import { Card } from "../../components/primitive";
import { DevicesGroup, LocationsGroup, VolumesGroup } from "./components";

interface Space {
	id: string;
	name: string;
	color: string;
}

function SpaceSwitcher({
	spaces,
	currentSpace,
}: {
	spaces: Space[] | undefined;
	currentSpace: Space | undefined;
}) {
	const [showDropdown, setShowDropdown] = useState(false);

	return (
		<View className="mb-4">
			<Pressable
				onPress={() => setShowDropdown(!showDropdown)}
				className="flex-row items-center gap-2 bg-sidebar-box border border-sidebar-line rounded-lg px-3 py-2"
			>
				<View
					className="w-2 h-2 rounded-full"
					style={{ backgroundColor: currentSpace?.color || "#666" }}
				/>
				<Text className="flex-1 text-sm font-medium text-sidebar-ink">
					{currentSpace?.name || "Select Space"}
				</Text>
				<Text className="text-sidebar-inkDull text-xs">
					{showDropdown ? "▲" : "▼"}
				</Text>
			</Pressable>

			{showDropdown && spaces && spaces.length > 0 && (
				<Card className="mt-2">
					{spaces.map((space) => (
						<Pressable
							key={space.id}
							className="flex-row items-center gap-2 py-2 px-2"
							onPress={() => setShowDropdown(false)}
						>
							<View
								className="w-2 h-2 rounded-full"
								style={{ backgroundColor: space.color }}
							/>
							<Text className="text-ink text-sm">{space.name}</Text>
						</Pressable>
					))}
				</Card>
			)}
		</View>
	);
}

export function BrowseScreen() {
	const insets = useSafeAreaInsets();
	const { data: spaces } = useLibraryQuery("spaces.list", {});
	const currentSpace = spaces && spaces.length > 0 ? spaces[0] : undefined;

	return (
		<ScrollView
			className="flex-1 bg-sidebar"
			contentContainerStyle={{
				paddingTop: insets.top + 16,
				paddingBottom: insets.bottom + 100,
				paddingHorizontal: 16,
			}}
		>
			{/* Header */}
			<View className="mb-6">
				<Text className="text-2xl font-bold text-ink">Browse</Text>
				<Text className="text-ink-dull text-sm mt-1">
					Your libraries and spaces
				</Text>
			</View>

			{/* Space Switcher */}
			<SpaceSwitcher
				spaces={spaces as Space[] | undefined}
				currentSpace={currentSpace as Space | undefined}
			/>

			{/* Locations */}
			<LocationsGroup />

			{/* Devices */}
			<DevicesGroup />

			{/* Volumes */}
			<VolumesGroup />
		</ScrollView>
	);
}
