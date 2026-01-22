import { useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { GlassButton } from "../components/GlassButton";
import { useJobs, type ExtendedJobListItem } from "../hooks/useJobs";
import { X } from "phosphor-react-native";

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getJobDisplayName(job: ExtendedJobListItem): string {
	if (job.name === "indexer") return "Indexing";
	if (job.name === "thumbnail_generation") return "Generating Thumbnails";

	if (job.action_context?.action_type) {
		const actionType = job.action_context.action_type;
		if (actionType === "files.copy") return "Copying Files";
		if (actionType === "files.move") return "Moving Files";
		if (actionType === "files.delete") return "Deleting Files";
	}

	return job.name
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function getJobSubtext(job: ExtendedJobListItem): string {
	if (job.status_message) return job.status_message;
	if (job.current_phase) return job.current_phase;

	if (job.generic_progress?.completion) {
		const { completed, total, bytes_completed, total_bytes } =
			job.generic_progress.completion;
		if (bytes_completed && total_bytes) {
			return `${formatBytes(bytes_completed)} / ${formatBytes(total_bytes)}`;
		}
		if (completed && total) {
			return `${completed} / ${total} items`;
		}
	}

	return job.status;
}

function formatTimeAgo(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	
	if (diffMins < 1) return "Just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	
	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24) return `${diffHours}h ago`;
	
	const diffDays = Math.floor(diffHours / 24);
	return `${diffDays}d ago`;
}

interface JobCardProps {
	job: ExtendedJobListItem;
	onPause: (jobId: string) => Promise<void>;
	onResume: (jobId: string) => Promise<void>;
	onCancel: (jobId: string) => Promise<void>;
}

function JobCard({ job, onPause, onResume, onCancel }: JobCardProps) {
	const isRunning = job.status === "running";
	const isPaused = job.status === "paused";
	const isCompleted = job.status === "completed";
	const isFailed = job.status === "failed";
	const canControl = isRunning || isPaused;

	const statusColor = isRunning
		? "text-accent"
		: isPaused
		? "text-yellow-500"
		: isCompleted
		? "text-green-500"
		: isFailed
		? "text-red-500"
		: "text-ink-dull";

	return (
		<View className="bg-app-box border border-app-line rounded-xl p-4 mb-3">
			<View className="flex-row items-start justify-between mb-2">
				<View className="flex-1 mr-3">
					<Text className="text-ink text-base font-semibold" numberOfLines={1}>
						{getJobDisplayName(job)}
					</Text>
					<Text className="text-ink-dull text-sm mt-1" numberOfLines={2}>
						{getJobSubtext(job)}
					</Text>
				</View>

				<View className="items-end">
					<Text className={`text-xs font-medium capitalize ${statusColor}`}>
						{job.status}
					</Text>
					{job.started_at && (
						<Text className="text-ink-faint text-xs mt-1">
							{isCompleted || isFailed
								? job.completed_at
									? formatTimeAgo(new Date(job.completed_at))
									: formatTimeAgo(new Date(job.started_at))
								: formatTimeAgo(new Date(job.started_at))}
						</Text>
					)}
				</View>
			</View>

			{/* Progress Bar */}
			{job.progress !== null && job.progress !== undefined && (isRunning || isPaused) && (
				<View className="bg-app-darkBox h-2 rounded-full overflow-hidden mb-3">
					<View
						className={`h-full rounded-full ${isPaused ? "bg-yellow-500" : "bg-accent"}`}
						style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
					/>
				</View>
			)}

			{/* Controls */}
			{canControl && (
				<View className="flex-row gap-2 mt-1">
					{isRunning && (
						<Pressable
							onPress={() => onPause(job.id)}
							className="bg-app-darkBox rounded-lg px-4 py-2 flex-1"
						>
							<Text className="text-ink-dull text-sm font-medium text-center">
								Pause
							</Text>
						</Pressable>
					)}
					{isPaused && (
						<Pressable
							onPress={() => onResume(job.id)}
							className="bg-accent/20 rounded-lg px-4 py-2 flex-1"
						>
							<Text className="text-accent text-sm font-medium text-center">
								Resume
							</Text>
						</Pressable>
					)}
					<Pressable
						onPress={() => onCancel(job.id)}
						className="bg-app-darkBox rounded-lg px-4 py-2"
					>
						<Text className="text-red-400 text-sm font-medium">Cancel</Text>
					</Pressable>
				</View>
			)}
		</View>
	);
}

type FilterType = "all" | "active" | "completed";

export default function JobsScreen() {
	const router = useRouter();
	const { jobs, activeJobCount, isLoading, pause, resume, cancel } = useJobs();
	const [filter, setFilter] = useState<FilterType>("active");

	const filteredJobs = jobs.filter((job) => {
		if (filter === "active") {
			return job.status === "running" || job.status === "paused";
		}
		if (filter === "completed") {
			return job.status === "completed" || job.status === "failed";
		}
		return true;
	});

	const FilterButton = ({ type, label }: { type: FilterType; label: string }) => (
		<Pressable
			onPress={() => setFilter(type)}
			className={`px-4 py-2 rounded-full ${
				filter === type ? "bg-accent" : "bg-app-box"
			}`}
		>
			<Text
				className={`text-sm font-medium ${
					filter === type ? "text-white" : "text-ink-dull"
				}`}
			>
				{label}
			</Text>
		</Pressable>
	);

	return (
		<View className="flex-1 bg-app">
			{/* Header */}
			<View
				className="bg-app-box border-b border-app-line"
				style={{ paddingTop: 18 }}
			>
				<View className="px-4 pb-4 flex-row items-center gap-3">
					<View className="flex-1">
						<Text className="text-ink text-xl font-bold">Jobs</Text>
						<Text className="text-ink-dull text-sm mt-0.5">
							{activeJobCount > 0
								? `${activeJobCount} active job${activeJobCount !== 1 ? "s" : ""}`
								: "No active jobs"}
						</Text>
					</View>
					<GlassButton
						onPress={() => router.back()}
						icon={<X size={20} color="hsl(235, 10%, 55%)" weight="bold" />}
					/>
				</View>

				{/* Filter Tabs */}
				<View className="flex-row gap-2 px-4 pb-3">
					<FilterButton type="active" label="Active" />
					<FilterButton type="completed" label="History" />
					<FilterButton type="all" label="All" />
				</View>
			</View>

			{/* Content */}
			{isLoading ? (
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator size="large" color="hsl(208, 100%, 57%)" />
				</View>
			) : filteredJobs.length === 0 ? (
				<View className="flex-1 items-center justify-center p-8">
					<Text className="text-ink-dull text-sm text-center">
						{filter === "active"
							? "No active jobs"
							: filter === "completed"
							? "No completed jobs"
							: "No jobs"}
					</Text>
				</View>
			) : (
				<FlatList
					data={filteredJobs}
					keyExtractor={(item) => item.id}
					renderItem={({ item }) => (
						<JobCard
							job={item}
							onPause={pause}
							onResume={resume}
							onCancel={cancel}
						/>
					)}
					contentContainerStyle={{ padding: 16 }}
				/>
			)}
		</View>
	);
}
