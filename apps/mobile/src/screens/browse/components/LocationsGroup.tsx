import React from "react";
import { Image } from "react-native";
import { useNormalizedQuery } from "../../../client";
import { SettingsGroup, SettingsLink } from "../../../components/primitive";
import FolderIcon from "@sd/assets/icons/Folder.png";

export function LocationsGroup() {
	const { data: locationsData } = useNormalizedQuery({
		wireMethod: "query:locations.list",
		input: null,
		resourceType: "location",
	});

	const locations = locationsData?.locations ?? [];

	if (locations.length === 0) {
		return null;
	}

	return (
		<SettingsGroup header="Locations">
			{locations.map((location: any) => (
				<SettingsLink
					key={location.id}
					icon={
						<Image
							source={FolderIcon}
							className="w-6 h-6"
							style={{ resizeMode: "contain" }}
						/>
					}
					label={location.name || "Unnamed"}
					description={location.path || "No path"}
					onPress={() => {
						// TODO: Navigate to location
					}}
				/>
			))}
		</SettingsGroup>
	);
}
