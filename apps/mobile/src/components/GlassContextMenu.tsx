import React, { useState, cloneElement, isValidElement } from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import {
	LiquidGlassView,
	isLiquidGlassSupported,
} from "@callstack/liquid-glass";
import type { ReactNode } from "react";

export interface MenuItem {
	label: string;
	onPress: () => void;
	icon?: ReactNode;
	active?: boolean;
}

interface GlassContextMenuProps {
	trigger: ReactNode;
	items: MenuItem[];
	className?: string;
}

export function GlassContextMenu({
	trigger,
	items,
	className,
}: GlassContextMenuProps) {
	const [visible, setVisible] = useState(false);

	const handleItemPress = (item: MenuItem) => {
		item.onPress();
		setVisible(false);
	};

	const menuContent = (
		<View className="py-2 min-w-[180]">
			{items.map((item, index) => (
				<Pressable
					key={index}
					onPress={() => handleItemPress(item)}
					className={`px-4 py-3 flex-row items-center gap-3 active:bg-app-hover ${
						item.active ? "bg-accent/10" : ""
					}`}
				>
					{item.icon && (
						<View className="w-5 h-5 items-center justify-center">
							{item.icon}
						</View>
					)}
					<Text
						className={`flex-1 text-ink ${item.active ? "text-accent font-medium" : ""}`}
					>
						{item.label}
					</Text>
				</Pressable>
			))}
		</View>
	);

	const handleTriggerPress = () => setVisible(true);

	const triggerElement = isValidElement(trigger)
		? cloneElement(trigger as React.ReactElement<any>, {
				onPress: handleTriggerPress,
				className: className,
		  })
		: (
			<Pressable onPress={handleTriggerPress} className={className}>
				{trigger}
			</Pressable>
		);

	return (
		<>
			{triggerElement}

			<Modal
				visible={visible}
				transparent
				animationType="fade"
				onRequestClose={() => setVisible(false)}
			>
				<Pressable
					style={StyleSheet.absoluteFill}
					onPress={() => setVisible(false)}
					className="bg-black/50"
				>
					<View className="flex-1" />
				</Pressable>

				{isLiquidGlassSupported ? (
					<View
						style={{
							position: "absolute",
							top: 60,
							right: 16,
						}}
					>
						<LiquidGlassView
							interactive
							effect="regular"
							colorScheme="dark"
							style={{
								borderRadius: 16,
								overflow: "hidden",
								minWidth: 180,
							}}
						>
							{menuContent}
						</LiquidGlassView>
					</View>
				) : (
					<View
						style={{
							position: "absolute",
							top: 60,
							right: 16,
							borderRadius: 16,
							overflow: "hidden",
							minWidth: 180,
						}}
					>
						<BlurView
							intensity={80}
							tint="dark"
							style={{
								borderWidth: 1,
								borderColor: "rgba(128, 128, 128, 0.3)",
								borderRadius: 16,
							}}
						>
							<View className="absolute inset-0 bg-app-box/20" />
							{menuContent}
						</BlurView>
					</View>
				)}
			</Modal>
		</>
	);
}

GlassContextMenu.displayName = "GlassContextMenu";
