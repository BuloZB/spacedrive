import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, Text, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OverviewStack } from "./stacks/OverviewStack";
import { BrowseStack } from "./stacks/BrowseStack";
import { NetworkStack } from "./stacks/NetworkStack";
import { SettingsStack } from "./stacks/SettingsStack";
import type { TabParamList } from "./types";
import { useJobs } from "../hooks/useJobs";

const Tab = createBottomTabNavigator<TabParamList>();

// Simple icon components (replace with phosphor-react-native later)
const TabIcon = ({ name, focused, badge }: { name: string; focused: boolean; badge?: number }) => (
	<View
		className={`items-center justify-center ${focused ? "opacity-100" : "opacity-50"}`}
	>
		<View className="relative">
			<View
				className={`h-6 w-6 rounded-md ${focused ? "bg-accent" : "bg-ink-faint"}`}
			/>
			{badge !== undefined && badge > 0 && (
				<View className="absolute -right-2 -top-2 bg-accent rounded-full min-w-[16px] h-[16px] items-center justify-center px-1">
					<Text className="text-white text-[9px] font-bold">
						{badge > 99 ? '99+' : badge}
					</Text>
				</View>
			)}
		</View>
		<Text
			className={`text-[10px] mt-1 ${focused ? "text-accent" : "text-ink-faint"}`}
		>
			{name}
		</Text>
	</View>
);

function OverviewTabIcon({ focused }: { focused: boolean }) {
	const { activeJobCount } = useJobs();
	return <TabIcon name="Overview" focused={focused} badge={activeJobCount} />;
}

export function TabNavigator() {
	const insets = useSafeAreaInsets();
	const tabBarHeight = Platform.OS === "ios" ? 80 : 60;

	return (
		<Tab.Navigator
			screenOptions={{
				headerShown: false,
				tabBarStyle: {
					height:
						tabBarHeight +
						(Platform.OS === "ios" ? 0 : insets.bottom),
					paddingBottom: Platform.OS === "ios" ? insets.bottom : 8,
					paddingTop: 8,
					backgroundColor: "hsl(235, 10%, 6%)",
					borderTopColor: "hsl(235, 15%, 23%)",
					borderTopWidth: 1,
				},
				tabBarShowLabel: false,
				tabBarActiveTintColor: "hsl(208, 100%, 57%)",
				tabBarInactiveTintColor: "hsl(235, 10%, 55%)",
			}}
		>
			<Tab.Screen
				name="OverviewTab"
				component={OverviewStack}
				options={{
					tabBarIcon: ({ focused }) => (
						<OverviewTabIcon focused={focused} />
					),
				}}
			/>
			<Tab.Screen
				name="BrowseTab"
				component={BrowseStack}
				options={{
					tabBarIcon: ({ focused }) => (
						<TabIcon name="Browse" focused={focused} />
					),
				}}
			/>
			<Tab.Screen
				name="NetworkTab"
				component={NetworkStack}
				options={{
					tabBarIcon: ({ focused }) => (
						<TabIcon name="Network" focused={focused} />
					),
				}}
			/>
			<Tab.Screen
				name="SettingsTab"
				component={SettingsStack}
				options={{
					tabBarIcon: ({ focused }) => (
						<TabIcon name="Settings" focused={focused} />
					),
				}}
			/>
		</Tab.Navigator>
	);
}
