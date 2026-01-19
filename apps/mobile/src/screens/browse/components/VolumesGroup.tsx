import React from "react";
import { Image } from "react-native";
import { useNormalizedQuery } from "../../../client";
import type { Volume } from "@sd/ts-client";
import { getVolumeIcon } from "@sd/ts-client";
import { SettingsGroup, SettingsLink } from "../../../components/primitive";

export function VolumesGroup() {
	const { data: volumesData } = useNormalizedQuery<any, { volumes: Volume[] }>(
		{
			wireMethod: "query:volumes.list",
			input: { filter: "All" },
			resourceType: "volume",
		}
	);

	const volumes = volumesData?.volumes || [];

	if (volumes.length === 0) {
		return null;
	}

	return (
		<SettingsGroup header="Volumes">
			{volumes.map((volume) => {
				const volumeIconSrc = getVolumeIcon(volume);
				return (
					<SettingsLink
						key={volume.id}
						icon={
							<Image
								source={volumeIconSrc}
								className="w-6 h-6"
								style={{ resizeMode: "contain" }}
							/>
						}
						label={volume.display_name || volume.name}
						description={
							volume.is_tracked ? "Tracked" : "Not tracked"
						}
						onPress={() => {
							// TODO: Navigate to volume
						}}
					/>
				);
			})}
		</SettingsGroup>
	);
}
