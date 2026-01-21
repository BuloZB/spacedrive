import React from "react";
import { Pressable, Text, View } from "react-native";
import { BlurView } from "expo-blur";

interface GlassButtonProps {
	onPress?: () => void;
	icon?: React.ReactNode;
	active?: boolean;
	className?: string;
}

export function GlassButton({ onPress, icon, active, className }: GlassButtonProps) {
	return (
		<Pressable
			onPress={onPress}
			className={`w-8 h-8 rounded-full overflow-hidden ${className || ""}`}
			style={({ pressed }) => ({
				opacity: pressed ? 0.7 : 1,
				transform: [{ scale: pressed ? 0.95 : 1 }],
			})}
		>
			<BlurView
				intensity={80}
				tint="dark"
				className="flex-1 items-center justify-center border border-app-line/30"
			>
				<View
					className={
						active
							? "absolute inset-0 bg-accent/20"
							: "absolute inset-0 bg-app-box/20"
					}
				/>
				{icon}
			</BlurView>
		</Pressable>
	);
}
