import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { BlurView } from "expo-blur";
import {
	LiquidGlassView,
	isLiquidGlassSupported,
} from "@callstack/liquid-glass";

interface GlassButtonProps {
	onPress?: () => void;
	icon?: ReactNode;
	active?: boolean;
	className?: string;
	size?: number;
}

export function GlassButton({
	onPress,
	icon,
	active,
	className,
	size = 40,
}: GlassButtonProps) {
	const iconSize = Math.round(size * 0.5);

	const content = (
		<View
			style={{
				width: size,
				height: size,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			{!isLiquidGlassSupported && (
				<View
					className={
						active
							? "absolute inset-0 bg-accent/20"
							: "absolute inset-0 bg-app-box/20"
					}
				/>
			)}
			<View
				style={{
					width: iconSize,
					height: iconSize,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				{icon}
			</View>
		</View>
	);

	if (isLiquidGlassSupported) {
		return (
			<Pressable
				onPress={onPress}
				className={className}
				style={({ pressed }) => ({
					opacity: pressed ? 0.9 : 1,
					transform: [{ scale: pressed ? 0.95 : 1 }],
				})}
			>
				<LiquidGlassView
					interactive
					effect="regular"
					colorScheme="dark"
					tintColor={active ? "rgba(40, 130, 250, 0.15)" : undefined}
					style={{
						width: size,
						height: size,
						borderRadius: size / 2,
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					{content}
				</LiquidGlassView>
			</Pressable>
		);
	}

	// Fallback for older iOS and Android
	return (
		<Pressable
			onPress={onPress}
			className={`overflow-hidden ${className || ""}`}
			style={({ pressed }) => ({
				width: size,
				height: size,
				borderRadius: size / 2,
				opacity: pressed ? 0.7 : 1,
				transform: [{ scale: pressed ? 0.95 : 1 }],
			})}
		>
			<BlurView
				intensity={80}
				tint="dark"
				style={{
					flex: 1,
					alignItems: "center",
					justifyContent: "center",
					borderWidth: 1,
					borderColor: "rgba(128, 128, 128, 0.3)",
					borderRadius: size / 2,
				}}
			>
				{content}
			</BlurView>
		</Pressable>
	);
}
