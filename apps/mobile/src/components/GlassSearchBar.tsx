import React, { forwardRef, useState, useEffect, useCallback } from "react";
import { TextInput, View, Pressable, type TextInputProps } from "react-native";
import { BlurView } from "expo-blur";
import {
	LiquidGlassView,
	isLiquidGlassSupported,
} from "@callstack/liquid-glass";
import { useRouter } from "expo-router";
import { MagnifyingGlass, X } from "phosphor-react-native";

interface GlassSearchBarProps extends Omit<TextInputProps, 'style' | 'onChange' | 'onChangeText'> {
	onPress?: () => void;
	onChange?: (value: string) => void;
	value?: string;
	className?: string;
	interactive?: boolean;
	debounceMs?: number;
}

export const GlassSearchBar = forwardRef<TextInput, GlassSearchBarProps>(
	(
		{
			onPress,
			onChange,
			value: controlledValue,
			className,
			interactive = true,
			editable = true,
			debounceMs = 300,
			...textInputProps
		},
		ref,
	) => {
		const router = useRouter();
		const [internalValue, setInternalValue] = useState("");
		const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(
			null,
		);

		const isControlled = controlledValue !== undefined;
		const currentValue = isControlled ? controlledValue : internalValue;

		const handleChange = useCallback(
			(text: string) => {
				// For controlled inputs, always call onChange immediately
				// The parent component handles the state update
				if (isControlled) {
					if (onChange) {
						onChange(text);
					}
					return;
				}

				// For uncontrolled inputs, update internal state immediately
				setInternalValue(text);

				// Clear existing timer
				if (debounceTimer) {
					clearTimeout(debounceTimer);
				}

				// Set new debounced timer only for uncontrolled inputs
				if (onChange) {
					const timer = setTimeout(() => {
						onChange(text);
					}, debounceMs);
					setDebounceTimer(timer);
				}
			},
			[isControlled, onChange, debounceMs, debounceTimer],
		);

		const handleClear = useCallback(() => {
			if (!isControlled) {
				setInternalValue("");
			}
			if (onChange) {
				onChange("");
			}
			if (debounceTimer) {
				clearTimeout(debounceTimer);
				setDebounceTimer(null);
			}
		}, [isControlled, onChange, debounceTimer]);

		const handlePress = useCallback(() => {
			if (onPress) {
				onPress();
			} else if (!editable) {
				router.push("/search");
			}
		}, [onPress, editable, router]);

		// Cleanup timer on unmount
		useEffect(() => {
			return () => {
				if (debounceTimer) {
					clearTimeout(debounceTimer);
				}
			};
		}, [debounceTimer]);

		const content = (
			<View className="flex-1 px-4 flex-row items-center gap-3">
				<MagnifyingGlass size={20} color="hsl(235, 10%, 55%)" weight="bold" />
			<TextInput
				ref={ref}
				editable={editable}
				pointerEvents={editable ? "auto" : "none"}
				value={currentValue}
				onChangeText={handleChange}
				placeholder="Search library"
				placeholderTextColor="hsl(235, 10%, 55%)"
				className="flex-1 text-ink text-base text-md"
				cursorColor="hsl(220, 90%, 56%)"
				{...textInputProps}
			/>
				{currentValue.length > 0 && editable && (
					<Pressable
						onPress={handleClear}
						className="p-1 -mr-1"
						hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
					>
						<X size={18} color="hsl(235, 10%, 55%)" weight="bold" />
					</Pressable>
				)}
			</View>
		);

		if (isLiquidGlassSupported) {
			return (
				<Pressable
					onPress={editable ? undefined : handlePress}
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
				onPress={editable ? undefined : handlePress}
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
	},
);

GlassSearchBar.displayName = "GlassSearchBar";
