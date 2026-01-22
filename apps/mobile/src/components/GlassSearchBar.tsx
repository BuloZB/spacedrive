import React, { forwardRef } from "react";
import { TextInput, View, Pressable, type TextInputProps } from "react-native";
import { BlurView } from "expo-blur";
import {
	LiquidGlassView,
	isLiquidGlassSupported,
} from "@callstack/liquid-glass";
import { useRouter } from "expo-router";
import { MagnifyingGlass } from "phosphor-react-native";

interface GlassSearchBarProps extends Omit<TextInputProps, 'style'> {
	onPress?: () => void;
	className?: string;
	interactive?: boolean;
}

export const GlassSearchBar = forwardRef<TextInput, GlassSearchBarProps>(
	({ onPress, className, interactive = true, editable, ...textInputProps }, ref) => {
		const router = useRouter();

		const handlePress = () => {
			if (onPress) {
				onPress();
			} else {
				router.push("/search");
			}
		};

		const content = (
			<View className="flex-1 px-4 flex-row items-center gap-3">
				<MagnifyingGlass size={20} color="hsl(235, 10%, 55%)" weight="bold" />
				<TextInput
					ref={ref}
					editable={editable ?? false}
					placeholder="Search library"
					placeholderTextColor="hsl(235, 10%, 55%)"
					className="flex-1 text-ink text-base text-md"
					cursorColor="hsl(220, 90%, 56%)"
					{...textInputProps}
				/>
			</View>
		);

		if (isLiquidGlassSupported) {
			return (
				<Pressable
					onPress={handlePress}
					className={className}
					style={{ opacity: 1 }}
				>
					<LiquidGlassView
						interactive={interactive}
						effect="regular"
						colorScheme="dark"
						style={{
							height: 48,
							borderRadius: 24,
							overflow: "hidden",
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
				onPress={handlePress}
				className={`overflow-hidden ${className || ""}`}
				style={{
					height: 48,
					borderRadius: 24,
				}}
			>
				<BlurView
					intensity={80}
					tint="dark"
					style={{
						flex: 1,
						borderWidth: 1,
						borderColor: "rgba(128, 128, 128, 0.3)",
						borderRadius: 24,
					}}
				>
					<View className="absolute inset-0 bg-app-box/20" />
					{content}
				</BlurView>
			</Pressable>
		);
	}
);

GlassSearchBar.displayName = "GlassSearchBar";
